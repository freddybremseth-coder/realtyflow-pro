import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function buildMarkdown(project: Record<string, any>) {
  const title = clean(project.title) || "Untitled";
  const subtitle = clean(project.subtitle);
  const metadata = (project.metadata_plan || {}) as Record<string, any>;
  const outline = (project.outline_plan || {}) as Record<string, any>;
  const toc = asArray<Record<string, any>>(outline.toc);
  const writingPlan = asArray<Record<string, any>>(outline.writing_plan);
  const chapterDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const keywords = asArray<string>(metadata.keywords);
  const categories = asArray<string>(metadata.categories);

  const parts: string[] = [];
  parts.push(`# ${title}`);
  if (subtitle) parts.push(`_${subtitle}_`);
  parts.push("");
  parts.push("## Project");
  parts.push(`- Language: ${clean(project.language) || "en"}`);
  parts.push(`- Target pages: ${project.target_pages ?? "-"}`);
  parts.push(`- Target words: ${project.target_words ?? "-"}`);
  parts.push(`- Audience: ${clean(project.audience) || "-"}`);
  parts.push(`- Niche: ${clean(project.niche) || "-"}`);
  parts.push("");

  parts.push("## KDP Metadata");
  parts.push(`- SEO title: ${clean(metadata.title) || "-"}`);
  parts.push(`- SEO subtitle: ${clean(metadata.subtitle) || "-"}`);
  parts.push(`- Positioning: ${clean(metadata.positioning) || "-"}`);
  parts.push(`- Launch angle: ${clean(metadata.launch_angle) || "-"}`);
  parts.push(`- Keywords: ${keywords.length ? keywords.join(", ") : "-"}`);
  parts.push(`- Categories: ${categories.length ? categories.join(" | ") : "-"}`);
  parts.push("");
  parts.push("### Description (HTML)");
  parts.push("```html");
  parts.push(clean(metadata.description_html) || "<p></p>");
  parts.push("```");
  parts.push("");
  parts.push("### Cover Brief");
  parts.push(clean(metadata.cover_brief) || "-");
  parts.push("");

  parts.push("## Book Promise");
  parts.push(clean(outline.book_promise) || "-");
  parts.push("");

  parts.push("## Table of Contents");
  if (toc.length === 0) {
    parts.push("- No TOC generated yet");
  } else {
    for (const row of toc) {
      parts.push(`- Chapter ${row.chapter ?? "?"}: ${clean(row.title)} (${clean(row.goal)} | ${row.target_words ?? "-"} words)`);
    }
  }
  parts.push("");

  parts.push("## Writing Plan");
  if (writingPlan.length === 0) {
    parts.push("- No writing plan generated yet");
  } else {
    for (const row of writingPlan) {
      parts.push(`- Week ${row.week ?? "?"}: ${clean(row.focus)} -> ${clean(row.deliverable)}`);
    }
  }
  parts.push("");

  parts.push("## Sample Chapter Drafts");
  if (chapterDrafts.length === 0) {
    parts.push("_No sample drafts generated yet._");
  } else {
    chapterDrafts.forEach((draft, index) => {
      parts.push(`### ${index + 1}. ${clean(draft.chapter_title) || `Chapter ${index + 1}`}`);
      parts.push(clean(draft.draft) || "_No draft text_");
      parts.push("");
    });
  }

  return parts.join("\n");
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const markdown = buildMarkdown(data as Record<string, any>);
  const fileName = `${clean((data as any).title).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "book-project"}-manuspakke.md`;
  return NextResponse.json({ id, file_name: fileName, markdown });
}
