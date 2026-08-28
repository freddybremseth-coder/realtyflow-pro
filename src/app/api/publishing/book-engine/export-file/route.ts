import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import { requireAdminApi } from "@/lib/api-admin";
import { toEpubBuffer as buildCanonicalEpub } from "@/lib/publishing/epub-export";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function extractJsonStringField(raw: string, field: string): string {
  const key = `"${field}"`;
  const keyIndex = raw.indexOf(key);
  if (keyIndex < 0) return "";
  const colonIndex = raw.indexOf(":", keyIndex + key.length);
  if (colonIndex < 0) return "";
  const firstQuote = raw.indexOf("\"", colonIndex + 1);
  if (firstQuote < 0) return "";

  let i = firstQuote + 1;
  let encoded = "";
  let escaped = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (escaped) {
      encoded += `\\${ch}`;
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      i += 1;
      continue;
    }
    if (ch === "\"") break;
    encoded += ch;
    i += 1;
  }

  try {
    return JSON.parse(`"${encoded}"`);
  } catch {
    return encoded
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
}

function sanitizeDraftText(raw: unknown): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const parsed = safeJsonParse<Record<string, unknown>>(fenced[1], {});
    const draft = String(parsed.draft || "").trim();
    if (draft) return draft;
  }
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    const parsed = safeJsonParse<Record<string, unknown>>(text, {});
    const draft = String(parsed.draft || "").trim();
    if (draft) return draft;
  }
  const looseDraft = extractJsonStringField(text, "draft").trim();
  if (looseDraft) return looseDraft;
  return text
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getProjectParts(project: Record<string, any>) {
  const title = clean(project.title) || "Untitled";
  const subtitle = clean(project.subtitle);
  const outline = (project.outline_plan || {}) as Record<string, any>;
  const chapterDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const toc = asArray<Record<string, any>>(outline.toc);
  const metadata = (project.metadata_plan || {}) as Record<string, any>;
  const imagePlan = metadata.image_plan || {};
  // Omslaget kan ligge to steder: book-engine bruker image_plan.cover, mens
  // Forfatterstudio (set_cover) lagrer det på metadata_plan.cover_image_url.
  // Godta begge, ellers havner ikke studio-omslaget i EPUB/DOCX (og dermed
  // ikke på KDP).
  const coverUrl = clean(imagePlan?.cover?.image_url) || clean(metadata.cover_image_url);
  const author = clean(metadata.author) || "Freddy Bremseth";
  const kdpDescription = clean((metadata.kdp || {}).description_html) || clean((metadata.kdp || {}).description);
  return { title, subtitle, chapterDrafts, toc, imagePlan, coverUrl, author, kdpDescription };
}

type LoadedImage = { buffer: Buffer; type: "jpg" | "png" | "gif" | "bmp" };

async function fetchImageBuffer(url: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const type: LoadedImage["type"] =
      contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : contentType.includes("gif")
          ? "gif"
          : contentType.includes("bmp")
            ? "bmp"
            : "png";
    return { buffer: Buffer.from(arr), type };
  } catch {
    return null;
  }
}

async function toDocxBuffer(project: Record<string, any>) {
  const { title, subtitle, chapterDrafts, imagePlan, coverUrl } = getProjectParts(project);
  const coverImageUrl = coverUrl;
  const chapterImages = asArray<Record<string, any>>(imagePlan?.chapters);
  const chapterImageMap = new Map<string, string>();
  for (const row of chapterImages) {
    const chapterTitle = clean(row.chapter_title).toLowerCase();
    const imageUrl = clean(row.image_url);
    if (chapterTitle && imageUrl) chapterImageMap.set(chapterTitle, imageUrl);
  }

  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
  ];
  if (subtitle) children.push(new Paragraph({ children: [new TextRun({ text: subtitle, italics: true })] }));
  children.push(new Paragraph({ text: "" }));

  if (coverImageUrl) {
    const coverImage = await fetchImageBuffer(coverImageUrl);
    if (coverImage) {
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: coverImage.type,
              data: coverImage.buffer,
              transformation: { width: 520, height: 300 },
            }),
          ],
        }),
      );
      children.push(new Paragraph({ text: "" }));
    }
  }

  for (let index = 0; index < chapterDrafts.length; index += 1) {
    const chapter = chapterDrafts[index];
    const chapterTitle = clean(chapter.chapter_title) || `Chapter ${index + 1}`;
    const draftText = sanitizeDraftText(chapter.draft) || "";
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(chapterTitle)] }));
    const imageUrl = chapterImageMap.get(chapterTitle.toLowerCase());
    const chapterParts = draftText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (imageUrl) {
      chapterParts.unshift(`__IMAGE_PLACEHOLDER__${imageUrl}`);
    }
    for (const para of chapterParts) {
      if (para.startsWith("__IMAGE_PLACEHOLDER__")) {
        const url = para.replace("__IMAGE_PLACEHOLDER__", "");
        const chapterImage = await fetchImageBuffer(url);
        if (chapterImage) {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: chapterImage.type,
                  data: chapterImage.buffer,
                  transformation: { width: 460, height: 270 },
                }),
              ],
            }),
          );
          children.push(new Paragraph({ text: "" }));
          continue;
        }
      }
      children.push(new Paragraph({ children: [new TextRun(para)] }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  const format = String(request.nextUrl.searchParams.get("format") || "docx").toLowerCase();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!["docx", "epub"].includes(format)) return NextResponse.json({ error: "format must be docx or epub" }, { status: 400 });

  const { data, error } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const project = data as Record<string, any>;
  const fileBase = slug(clean(project.title) || "book-project");

  if (format === "docx") {
    const buffer = await toDocxBuffer(project);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileBase}.docx"`,
      },
    });
  }

  const buffer = await buildCanonicalEpub(project);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${fileBase}.epub"`,
    },
  });
}
