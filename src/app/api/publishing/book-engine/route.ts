import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    const cleaned = value
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function asKeywords(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(String).map((v) => v.trim()).filter(Boolean);
  return String(raw || "")
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function generateSeoPlan(input: Record<string, any>) {
  const prompt = `
Du er en KDP SEO-ekspert. Returner KUN gyldig JSON.

Mål:
- Lag metadata som er trygg, troverdig og salgsorientert.
- Ingen medisinske garantier eller udokumenterte påstander.

Input:
${JSON.stringify(input, null, 2)}

JSON schema:
{
  "title": "string",
  "subtitle": "string",
  "positioning": "string",
  "description_html": "string",
  "keywords": ["string"],
  "categories": ["string"],
  "cover_brief": "string",
  "launch_angle": "string"
}
`;

  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2200, temperature: 0.5 });
  return safeJsonParse(raw, {
    title: input.title || "Untitled",
    subtitle: input.subtitle || "",
    positioning: input.positioning || "",
    description_html: `<p>${input.title || "Book"} is a practical guide for ${input.audience || "readers"}.</p>`,
    keywords: input.seed_keywords || [],
    categories: [],
    cover_brief: "Premium, clear, thumbnail-first KDP cover.",
    launch_angle: "Practical and beginner-friendly entry point.",
  });
}

async function generateAuthorPlan(input: Record<string, any>, seoPlan: Record<string, any>) {
  const prompt = `
Du er en profesjonell sakprosaforfatter. Returner KUN gyldig JSON.

Krav:
- Strukturert bokplan med tydelig progresjon.
- Match mål for ord/sider.
- Skriv praktisk og kommersielt relevant.

Input:
${JSON.stringify({ ...input, seoPlan }, null, 2)}

JSON schema:
{
  "book_promise": "string",
  "toc": [{"chapter": 1, "title": "string", "goal": "string", "target_words": 1200}],
  "writing_plan": [{"week": 1, "focus": "string", "deliverable": "string"}],
  "sample_chapters": [{"chapter_title": "string", "draft": "string"}]
}
`;

  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 3200, temperature: 0.6 });
  return safeJsonParse(raw, {
    book_promise: "Clear practical value for the target reader.",
    toc: [],
    writing_plan: [],
    sample_chapters: [],
  });
}

async function generateChapterDraftBatch(project: Record<string, any>, count = 2) {
  const toc = asArray<Record<string, any>>(project.outline_plan?.toc);
  const existingDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const draftedTitles = new Set(existingDrafts.map((d) => String(d.chapter_title || "").toLowerCase()));
  const missing = toc.filter((row) => !draftedTitles.has(String(row.title || "").toLowerCase())).slice(0, count);
  if (missing.length === 0) return { added: [], done: true };

  const prompt = `
Du er en profesjonell sakprosaforfatter. Returner KUN gyldig JSON.

Skriv utkast for disse kapitlene basert på prosjektet.
Krav:
- Praktisk, konkret og leservennlig
- Ingen medisinske garantier
- 600-1200 ord per kapittelutkast

Prosjekt:
${JSON.stringify(
  {
    title: project.title,
    subtitle: project.subtitle,
    audience: project.audience,
    language: project.language,
    niche: project.niche,
    metadata_plan: project.metadata_plan || {},
    outline_plan: project.outline_plan || {},
  },
  null,
  2,
)}

Kapitler å skrive nå:
${JSON.stringify(missing, null, 2)}

JSON schema:
{
  "chapters": [
    { "chapter_title": "string", "draft": "string" }
  ]
}
`;

  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 4200, temperature: 0.65 });
  const parsed = safeJsonParse<{ chapters: Array<{ chapter_title: string; draft: string }> }>(raw, { chapters: [] });
  const added = asArray(parsed.chapters).filter((c) => c?.chapter_title && c?.draft);
  return { added, done: missing.length <= added.length };
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ projects: [] });

  const { data, error } = await supabase
    .from("publishing_book_projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (/publishing_book_projects|schema cache|does not exist|relation/i.test(error.message)) {
      return NextResponse.json({ projects: [], tableNotReady: true, error: error.message });
    }
    return NextResponse.json({ projects: [], error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projects: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const mode = String(body.mode || "create");

  if (mode === "continue") {
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required for continue mode" }, { status: 400 });
    const chapterCount = Math.min(Math.max(Number(body.chapter_count || 2), 1), 4);

    const { data: project, error: loadError } = await supabase
      .from("publishing_book_projects")
      .select("*")
      .eq("id", id)
      .single();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

    try {
      const batch = await generateChapterDraftBatch(project as Record<string, any>, chapterCount);
      const mergedDrafts = [...asArray((project as any).chapter_drafts), ...batch.added];
      const { data, error } = await supabase
        .from("publishing_book_projects")
        .update({
          chapter_drafts: mergedDrafts,
          status: batch.done ? "ready_for_export" : "drafting",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, mode: "continue", added: batch.added.length, project: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not continue drafting";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const input = {
    brand_id: String(body.brand_id || "freddypublishing"),
    title,
    subtitle: String(body.subtitle || "").trim(),
    language: String(body.language || "en"),
    niche: String(body.niche || "olive_oil_mediterranean"),
    audience: String(body.audience || "health-conscious readers 40+"),
    positioning: String(body.positioning || ""),
    target_words: Number(body.target_words || 30000),
    target_pages: Number(body.target_pages || 180),
    seed_keywords: asKeywords(body.seed_keywords),
  };

  try {
    const seoPlan = await generateSeoPlan(input);
    const authorPlan = await generateAuthorPlan(input, seoPlan);

    const insertPayload = {
      ...input,
      status: "generated",
      metadata_plan: seoPlan,
      outline_plan: {
        book_promise: authorPlan.book_promise || "",
        toc: Array.isArray(authorPlan.toc) ? authorPlan.toc : [],
        writing_plan: Array.isArray(authorPlan.writing_plan) ? authorPlan.writing_plan : [],
      },
      chapter_drafts: Array.isArray(authorPlan.sample_chapters) ? authorPlan.sample_chapters : [],
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("publishing_book_projects").insert(insertPayload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, project: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate book project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
