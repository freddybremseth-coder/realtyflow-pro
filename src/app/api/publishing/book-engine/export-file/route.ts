import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getProjectParts(project: Record<string, any>) {
  const title = clean(project.title) || "Untitled";
  const subtitle = clean(project.subtitle);
  const outline = (project.outline_plan || {}) as Record<string, any>;
  const chapterDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const toc = asArray<Record<string, any>>(outline.toc);
  return { title, subtitle, chapterDrafts, toc };
}

async function toDocxBuffer(project: Record<string, any>) {
  const { title, subtitle, chapterDrafts } = getProjectParts(project);
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
  ];
  if (subtitle) children.push(new Paragraph({ children: [new TextRun({ text: subtitle, italics: true })] }));
  children.push(new Paragraph({ text: "" }));

  chapterDrafts.forEach((chapter, index) => {
    const chapterTitle = clean(chapter.chapter_title) || `Chapter ${index + 1}`;
    const draftText = clean(chapter.draft) || "";
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(chapterTitle)] }));
    for (const para of draftText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      children.push(new Paragraph({ children: [new TextRun(para)] }));
    }
    children.push(new Paragraph({ text: "" }));
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

async function toEpubBuffer(project: Record<string, any>) {
  const Epub = (await import("epub-gen")).default as any;
  const { title, subtitle, chapterDrafts, toc } = getProjectParts(project);
  const author = "Freddy Bremseth";

  const content = chapterDrafts.length > 0
    ? chapterDrafts.map((chapter, index) => ({
        title: clean(chapter.chapter_title) || `Chapter ${index + 1}`,
        data: `<h1>${clean(chapter.chapter_title) || `Chapter ${index + 1}`}</h1><p>${clean(chapter.draft).replace(/\n\n/g, "</p><p>")}</p>`,
      }))
    : toc.map((row, index) => ({
        title: clean(row.title) || `Chapter ${index + 1}`,
        data: `<h1>${clean(row.title) || `Chapter ${index + 1}`}</h1><p>${clean(row.goal) || ""}</p>`,
      }));

  const tmpPath = path.join(os.tmpdir(), `${slug(title) || "book"}-${Date.now()}.epub`);
  const option = {
    title,
    author,
    publisher: author,
    content,
    description: subtitle || title,
    output: tmpPath,
    appendChapterTitles: false,
  };

  // eslint-disable-next-line no-new
  await new Epub(option).promise;
  const buffer = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath).catch(() => {});
  return buffer;
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
