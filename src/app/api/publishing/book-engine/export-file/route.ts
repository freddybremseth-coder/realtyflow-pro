import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

function xmlEscape(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getProjectParts(project: Record<string, any>) {
  const title = clean(project.title) || "Untitled";
  const subtitle = clean(project.subtitle);
  const outline = (project.outline_plan || {}) as Record<string, any>;
  const chapterDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const toc = asArray<Record<string, any>>(outline.toc);
  const imagePlan = ((project.metadata_plan || {}) as Record<string, any>).image_plan || {};
  return { title, subtitle, chapterDrafts, toc, imagePlan };
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
  const { title, subtitle, chapterDrafts, imagePlan } = getProjectParts(project);
  const coverImageUrl = clean(imagePlan?.cover?.image_url);
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

async function toEpubBuffer(project: Record<string, any>) {
  const { title, subtitle, chapterDrafts, toc, imagePlan } = getProjectParts(project);
  const author = "Freddy Bremseth";
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  const metaInf = zip.folder("META-INF");
  metaInf?.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const oebps = zip.folder("OEBPS");
  const images = oebps?.folder("images");
  const text = oebps?.folder("text");

  const allChapters = chapterDrafts.length > 0
    ? chapterDrafts.map((chapter, index) => ({
        title: clean(chapter.chapter_title) || `Chapter ${index + 1}`,
        body: sanitizeDraftText(chapter.draft) || "",
      }))
    : toc.map((row, index) => ({
        title: clean(row.title) || `Chapter ${index + 1}`,
        body: clean(row.goal) || "",
      }));

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navListItems: string[] = [];
  const imageManifest: string[] = [];

  const coverImageUrl = clean(imagePlan?.cover?.image_url);
  let coverImageHref = "";
  if (coverImageUrl && images) {
    const loaded = await fetchImageBuffer(coverImageUrl);
    if (loaded) {
      const ext = loaded.type === "jpg" ? "jpg" : loaded.type;
      const coverName = `cover.${ext}`;
      images.file(coverName, loaded.buffer);
      coverImageHref = `images/${coverName}`;
      imageManifest.push(
        `<item id="cover-image" href="${coverImageHref}" media-type="${loaded.type === "jpg" ? "image/jpeg" : `image/${loaded.type}`}" properties="cover-image"/>`,
      );
    }
  }

  for (let i = 0; i < allChapters.length; i += 1) {
    const chapter = allChapters[i];
    const chapterId = `chap${i + 1}`;
    const chapterFile = `${chapterId}.xhtml`;
    const titleSafe = xmlEscape(chapter.title || `Chapter ${i + 1}`);
    const paragraphs = String(chapter.body || "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${xmlEscape(p)}</p>`)
      .join("\n");
    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${titleSafe}</title>
  </head>
  <body>
    <h1>${titleSafe}</h1>
    ${paragraphs || "<p></p>"}
  </body>
</html>`;
    text?.file(chapterFile, chapterXhtml);
    manifestItems.push(`<item id="${chapterId}" href="text/${chapterFile}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${chapterId}"/>`);
    navListItems.push(`<li><a href="text/${chapterFile}">${titleSafe}</a></li>`);
  }

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Table of Contents</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        ${navListItems.join("\n")}
      </ol>
    </nav>
  </body>
</html>`;
  oebps?.file("nav.xhtml", navXhtml);

  const bookId = slug(title) || `book-${Date.now()}`;
  const modifiedIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${xmlEscape(bookId)}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title>
    <dc:creator>${xmlEscape(author)}</dc:creator>
    <dc:language>${xmlEscape(clean(project.language) || "en")}</dc:language>
    <dc:description>${xmlEscape(subtitle || title)}</dc:description>
    <meta property="dcterms:modified">${modifiedIso}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${imageManifest.join("\n")}
    ${manifestItems.join("\n")}
  </manifest>
  <spine>
    ${spineItems.join("\n")}
  </spine>
</package>`;
  oebps?.file("content.opf", contentOpf);

  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
}

export async function GET(request: NextRequest) {
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

  const buffer = await toEpubBuffer(project);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${fileBase}.epub"`,
    },
  });
}
