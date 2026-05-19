import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";
import { uploadThumbnail } from "@/services/storage/media";

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
    const cleaned = value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asKeywords(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(String).map((v) => v.trim()).filter(Boolean);
  return String(raw || "")
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
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
    description_html: `<p>${input.title || "Book"} is a practical guide.</p>`,
    keywords: input.seed_keywords || [],
    categories: [],
    cover_brief: "Premium, clean cover with strong thumbnail readability.",
    launch_angle: "Practical beginner-friendly angle.",
  });
}

async function generateAuthorPlan(input: Record<string, any>, seoPlan: Record<string, any>) {
  const prompt = `
Du er en profesjonell sakprosaforfatter. Returner KUN gyldig JSON.

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

async function loadSeriesContext(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  seriesName: string,
) {
  if (!seriesName) return [];
  const { data } = await supabase
    .from("publishing_books")
    .select("title,subtitle,notes,next_action,role,status")
    .eq("series_name", seriesName)
    .order("updated_at", { ascending: false })
    .limit(15);
  return (data || []).map((row: any) => ({
    title: row.title,
    subtitle: row.subtitle,
    role: row.role,
    status: row.status,
    notes: row.notes,
    next_action: row.next_action,
  }));
}

async function generateImagePlan(project: Record<string, any>, toc: Array<Record<string, any>>, chapterDrafts: Array<Record<string, any>>) {
  const prompt = `
Du er creative director for bokillustrasjoner. Returner KUN gyldig JSON.

Lag ett forsideprompt og ett bildeprompt per kapittel.
Ingen tekst i bilder.

Prosjekt:
${JSON.stringify(
    {
      title: project.title,
      subtitle: project.subtitle,
      language: project.language,
      niche: project.niche,
      audience: project.audience,
      toc,
      chapter_drafts: chapterDrafts.map((d) => ({
        chapter_title: d.chapter_title,
        draft_excerpt: String(d.draft || "").slice(0, 450),
      })),
    },
    null,
    2,
  )}

JSON schema:
{
  "cover_prompt": "string",
  "chapter_prompts": [{ "chapter_title": "string", "prompt": "string" }]
}
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2600, temperature: 0.5 });
  return safeJsonParse(raw, { cover_prompt: "", chapter_prompts: [] as Array<{ chapter_title: string; prompt: string }> });
}

async function persistGeneratedImage(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  imageBase64: string,
  mimeType: string,
  brand: string,
  kind: string,
) {
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const safeBrand = (brand || "generated").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const storagePath = `generated/${safeBrand}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(imageBase64, "base64");

  const { error: uploadError } = await supabase.storage
    .from("content-images")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;
  const thumbnailUrl = await uploadThumbnail(supabase, buffer, mimeType, storagePath);

  await supabase.from("user_image_bank").insert({
    owner: brand || "freddypublishing",
    url: publicUrl,
    thumbnail_url: thumbnailUrl,
    name: kind === "book_cover" ? "Book cover concept" : "Book chapter image",
    kind: "image",
    tags: [kind, "book-engine"],
  });
  return publicUrl;
}

async function generateImageFromPrompt(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  prompt: string,
  brand = "freddypublishing",
  kind = "book_chapter",
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate a premium photorealistic editorial image: ${prompt}. No text, letters, or watermark.` }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"], temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message || `Image generation failed (${res.status})`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: any) => p?.inlineData?.data);
  if (!imagePart) throw new Error("No image returned from model");
  return persistGeneratedImage(supabase, imagePart.inlineData.data, imagePart.inlineData.mimeType || "image/png", brand, kind);
}

async function generateChapterDraftBatch(project: Record<string, any>, count = 2) {
  const toc = asArray<Record<string, any>>(project.outline_plan?.toc);
  const existingDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const draftedTitles = new Set(existingDrafts.map((d) => String(d.chapter_title || "").toLowerCase()));
  const missing = toc.filter((row) => !draftedTitles.has(String(row.title || "").toLowerCase())).slice(0, count);
  if (missing.length === 0) return { added: [], done: true };

  const prompt = `
Du er en profesjonell sakprosaforfatter. Returner KUN gyldig JSON.

Skriv kapittelutkast for disse kapitlene:
${JSON.stringify(missing, null, 2)}

Prosjekt:
${JSON.stringify(
    {
      title: project.title,
      subtitle: project.subtitle,
      audience: project.audience,
      language: project.language,
      niche: project.niche,
      metadata_plan: project.metadata_plan || {},
    },
    null,
    2,
  )}

JSON schema:
{
  "chapters": [{ "chapter_title": "string", "draft": "string" }]
}
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 4200, temperature: 0.65 });
  const parsed = safeJsonParse<{ chapters: Array<{ chapter_title: string; draft: string }> }>(raw, { chapters: [] });
  const added = asArray(parsed.chapters).filter((c) => c?.chapter_title && c?.draft);
  return { added, done: missing.length <= added.length };
}

async function generateImageBatch(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  project: Record<string, any>,
  limit = 4,
) {
  const metadata = (project.metadata_plan || {}) as Record<string, any>;
  const imagePlan = (metadata.image_plan || {}) as Record<string, any>;
  const cover = (imagePlan.cover || {}) as Record<string, any>;
  const chapters = asArray<Record<string, any>>(imagePlan.chapters);

  const queue: Array<{ type: "cover" | "chapter"; idx: number; prompt: string }> = [];
  if (cover.prompt && !cover.image_url) queue.push({ type: "cover", idx: -1, prompt: String(cover.prompt) });
  chapters.forEach((row, idx) => {
    if (row.prompt && !row.image_url) queue.push({ type: "chapter", idx, prompt: String(row.prompt) });
  });

  let generated = 0;
  let failed = 0;
  for (const item of queue.slice(0, Math.max(1, Math.min(limit, 6)))) {
    try {
      const url = await generateImageFromPrompt(
        supabase,
        item.prompt,
        "freddypublishing",
        item.type === "cover" ? "book_cover" : "book_chapter",
      );
      if (item.type === "cover") cover.image_url = url;
      else chapters[item.idx] = { ...chapters[item.idx], image_url: url, status: "generated" };
      generated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "image_failed";
      if (item.type === "cover") cover.error = message;
      else chapters[item.idx] = { ...chapters[item.idx], error: message, status: "error" };
      failed += 1;
    }
  }

  return {
    generated,
    failed,
    remaining: Math.max(0, queue.length - generated),
    image_plan: { cover, chapters },
  };
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
    const { data: project, error: loadError } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

    const batch = await generateChapterDraftBatch(project as Record<string, any>, chapterCount);
    const mergedDrafts = [...asArray((project as any).chapter_drafts), ...batch.added];
    const { data, error } = await supabase
      .from("publishing_book_projects")
      .update({ chapter_drafts: mergedDrafts, status: batch.done ? "ready_for_export" : "drafting", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, mode: "continue", added: batch.added.length, project: data });
  }

  if (mode === "generate_images") {
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required for generate_images mode" }, { status: 400 });
    const batchLimit = Math.min(Math.max(Number(body.batch_limit || 4), 1), 6);
    const { data: project, error: loadError } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

    const toc = asArray<Record<string, any>>((project as any).outline_plan?.toc);
    const chapterDrafts = asArray<Record<string, any>>((project as any).chapter_drafts);
    const metadata = { ...(((project as any).metadata_plan || {}) as Record<string, any>) };

    if (!metadata.image_plan?.cover?.prompt || !Array.isArray(metadata.image_plan?.chapters)) {
      const planned = await generateImagePlan(project as Record<string, any>, toc, chapterDrafts);
      const prompts = asArray<{ chapter_title: string; prompt: string }>(planned.chapter_prompts);
      metadata.image_plan = {
        cover: {
          prompt: planned.cover_prompt || `Premium photorealistic book cover concept for "${(project as any).title}", mediterranean tone, no text.`,
          image_url: null,
          status: "pending",
        },
        chapters: toc.map((row) => {
          const chapterTitle = String(row.title || "");
          const found = prompts.find((p) => String(p.chapter_title || "").toLowerCase() === chapterTitle.toLowerCase());
          return {
            chapter_title: chapterTitle,
            prompt: found?.prompt || `Photorealistic editorial scene representing chapter "${chapterTitle}" from "${(project as any).title}".`,
            image_url: null,
            status: "pending",
          };
        }),
      };
    }

    const batch = await generateImageBatch(supabase, { ...(project as any), metadata_plan: metadata }, batchLimit);
    metadata.image_plan = batch.image_plan;
    const { data, error } = await supabase
      .from("publishing_book_projects")
      .update({ metadata_plan: metadata, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      mode: "generate_images",
      generated: batch.generated,
      failed: batch.failed,
      remaining: batch.remaining,
      project: data,
    });
  }

  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const input = {
    brand_id: String(body.brand_id || "freddypublishing"),
    title,
    subtitle: String(body.subtitle || "").trim(),
    language: String(body.language || "en"),
    niche: String(body.niche || "olive_oil_mediterranean"),
    genre: String(body.genre || "guide"),
    series_name: String(body.series_name || ""),
    audience: String(body.audience || "health-conscious readers 40+"),
    positioning: String(body.positioning || ""),
    target_words: Number(body.target_words || 30000),
    target_pages: Number(body.target_pages || 180),
    seed_keywords: asKeywords(body.seed_keywords),
  };

  const seriesContext = await loadSeriesContext(supabase, input.series_name);
  const enrichedInput = { ...input, series_context: seriesContext };

  const baseInsertPayload = {
    ...enrichedInput,
    status: "generating",
    metadata_plan: { generation_state: "started" },
    outline_plan: { book_promise: "", toc: [], writing_plan: [] },
    chapter_drafts: [],
    updated_at: new Date().toISOString(),
  };

  const { data: createdProject, error: createError } = await supabase
    .from("publishing_book_projects")
    .insert(baseInsertPayload)
    .select()
    .single();
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  try {
    const seoPlan = await generateSeoPlan(enrichedInput);
    const authorPlan = await generateAuthorPlan(enrichedInput, seoPlan);
    const updatePayload = {
      status: "generated",
      metadata_plan: seoPlan,
      outline_plan: {
        book_promise: authorPlan.book_promise || "",
        toc: asArray(authorPlan.toc),
        writing_plan: asArray(authorPlan.writing_plan),
      },
      chapter_drafts: asArray(authorPlan.sample_chapters),
      updated_at: new Date().toISOString(),
    };

    const { data: generatedProject, error: updateError } = await supabase
      .from("publishing_book_projects")
      .update(updatePayload)
      .eq("id", (createdProject as any).id)
      .select()
      .single();
    if (updateError) {
      return NextResponse.json({ success: true, project: createdProject, warning: updateError.message });
    }

    return NextResponse.json({ success: true, project: generatedProject });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate book project";
    await supabase
      .from("publishing_book_projects")
      .update({
        status: "generation_failed",
        metadata_plan: { generation_state: "failed", generation_error: message },
        updated_at: new Date().toISOString(),
      })
      .eq("id", (createdProject as any).id);
    return NextResponse.json({
      success: true,
      project: createdProject,
      warning: `Prosjekt opprettet, men generering stoppet: ${message}`,
    });
  }
}
