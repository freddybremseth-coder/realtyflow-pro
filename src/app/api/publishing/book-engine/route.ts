import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";
import { researchWeb } from "@/services/ai/research";
import { uploadThumbnail } from "@/services/storage/media";
import { bibleForPrompt, bibleFromMetadata, resolveCraft, voiceForPrompt, type BookBible } from "@/lib/author-craft";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// To-pass-skriving med sonnet tar tid — gi ruten rom for et helt kapittel.
export const maxDuration = 300;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function normalizeTitleKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

  const noFences = text
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  return noFences || text;
}

function mergeChapterDrafts(
  existing: Array<Record<string, any>>,
  incoming: Array<Record<string, any>>,
) {
  const out: Array<Record<string, any>> = [];
  const seen = new Set<string>();
  for (const row of [...existing, ...incoming]) {
    const key = normalizeTitleKey(row?.chapter_title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function compactForPrompt(input: Record<string, any>) {
  const source = String(input.source_material || "");
  return {
    ...input,
    source_material: source ? source.slice(0, 12000) : "",
    source_material_truncated: source.length > 12000,
    source_material_length: source.length,
  };
}

async function generateSeoPlan(input: Record<string, any>) {
  const promptInput = compactForPrompt(input);
  const prompt = `
Du er en KDP SEO-ekspert. Returner KUN gyldig JSON.

Mål:
- Lag metadata som er trygg, troverdig og salgsorientert.
- Ingen medisinske garantier eller udokumenterte påstander.

Input:
${JSON.stringify(promptInput, null, 2)}

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
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2200, temperature: 0.45 });
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

async function generateAuthorPlan(input: Record<string, any>, seoPlan: Record<string, any>, sampleChapterCount = 2) {
  const promptInput = compactForPrompt(input);
  const chapterCount = Math.min(Math.max(Number(sampleChapterCount || 2), 1), 2);
  const prompt = `
Du er en profesjonell sakprosaforfatter. Returner KUN gyldig JSON.

Input:
${JSON.stringify({ ...promptInput, seoPlan }, null, 2)}

JSON schema:
{
  "book_promise": "string",
  "toc": [{"chapter": 1, "title": "string", "goal": "string", "target_words": 1800}],
  "writing_plan": [{"week": 1, "focus": "string", "deliverable": "string"}],
  "sample_chapters": []
}

Krav:
- IKKE skriv sample_chapters — kapitlene skrives i et eget kvalitetssteg etterpå. Returner alltid sample_chapters som tom liste []. (Parameter: ${chapterCount})
- Sett realistiske target_words per kapittel (1200–3000) ut fra bokens totale mål.
- Hvis genre er memoir/biografi:
  - IKKE finn opp nye fakta, personer, hendelser, datoer, steder eller dialog.
  - IKKE legg til detaljer som ikke finnes i kildetekst eller brukerens instruks.
  - Forbedre kun språk, struktur, flyt og lesbarhet.
  - Hvis noe er uklart, skriv [MÅ VERIFISERES] i stedet for å gjette.
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2200, temperature: 0.5 });
  return safeJsonParse(raw, {
    book_promise: "Clear practical value for the target reader.",
    toc: [],
    writing_plan: [],
    sample_chapters: [],
  });
}

async function generateRevisionReport(input: Record<string, any>, authorPlan: Record<string, any>) {
  const source = String(input.source_material || "").slice(0, 9000);
  if (!source.trim()) return null;
  const prompt = `
Du er en redaktør. Returner KUN gyldig JSON.

Sammenlign kildeteksten med den nye planen/utkastet.

Kildetekst:
${source}

Ny plan/utkast:
${JSON.stringify(
    {
      book_promise: authorPlan.book_promise || "",
      toc: asArray(authorPlan.toc).slice(0, 25),
      sample_chapters: asArray(authorPlan.sample_chapters).slice(0, 4),
      source_mode: input.source_mode || "from_brief",
      source_instructions: input.source_instructions || "",
    },
    null,
    2,
  )}

JSON schema:
{
  "summary": "string",
  "kept": ["string"],
  "changed": ["string"],
  "added": ["string"],
  "risks": ["string"],
  "editor_note": "string"
}
`;
  const raw = await askClaude(prompt, { model: "haiku", maxTokens: 1100, temperature: 0.35 });
  return safeJsonParse(raw, {
    summary: "Automatisk forbedret manus basert på kildetekst.",
    kept: [],
    changed: [],
    added: [],
    risks: [],
    editor_note: "",
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
Hvis genre=children:
- bruk ønsket illustration_style konsekvent
- opprett en character_bible for alle recurring_characters
- hvert kapittelprompt må inkludere samme visuelle trekk for gjengangere
- hvis stil er pixar_like: bruk "3D family animation look, cinematic lighting, expressive faces" (ikke logo/brandnavn)

Prosjekt:
${JSON.stringify(
    {
      title: project.title,
      subtitle: project.subtitle,
      language: project.language,
      genre: project.genre,
      niche: project.niche,
      audience: project.audience,
      illustration_style: project.illustration_style,
      consistency_notes: project.consistency_notes,
      recurring_characters: project.recurring_characters,
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
  "style_guide": "string",
  "character_bible": [{"name":"string","description":"string","consistency_rules":"string"}],
  "chapter_prompts": [{ "chapter_title": "string", "prompt": "string" }]
}
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2200, temperature: 0.45 });
  return safeJsonParse(raw, {
    cover_prompt: "",
    style_guide: "",
    character_bible: [] as Array<{ name: string; description: string; consistency_rules: string }>,
    chapter_prompts: [] as Array<{ chapter_title: string; prompt: string }>,
  });
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

  const premiumPrompt = [
    "Create a premium, high-detail, publication-ready illustration.",
    "Use cinematic composition, realistic lighting, rich textures, and professional color grading.",
    "Avoid simplistic clipart look, low detail, flat backgrounds, and text overlays.",
    "No text, letters, logos, or watermark.",
    "Prompt:",
    prompt,
  ].join(" ");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: premiumPrompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"], temperature: 0.8 },
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

// ─── Forfatter 2.0: to-pass kapittelskriving ─────────────────────────────────
// Hvert kapittel skrives i tre steg med sonnet: (1) fullt utkast med
// sjangerregler, bok-bibel og forfatterstemme, (2) redaktørkritikk mot
// sjangerens rubrikk, (3) revisjon som retter kritikken. Til slutt
// oppsummeres kapittelet (haiku) og bok-bibelen oppdateres, slik at neste
// kapittel kjenner det som allerede er skrevet.

function projectContextForWriting(project: Record<string, any>) {
  return {
    title: project.title,
    subtitle: project.subtitle,
    audience: project.audience,
    language: project.language,
    niche: project.niche,
    positioning: project.positioning,
    book_promise: project.outline_plan?.book_promise || "",
  };
}

/**
 * Research-grunnlag for faktabaserte sjangre: web-søk etter ferske fakta,
 * tall og eksempler for kapittelet FØR det skrives. Valgfritt steg —
 * feiler søket (eller mangler nøkkel), skrives kapittelet uten research.
 */
async function researchChapter(project: Record<string, any>, tocRow: Record<string, any>, craftId: string) {
  if (!["guide", "self_development"].includes(craftId)) return "";
  if (project.metadata_plan?.research === "off") return "";
  const { text: brief } = await researchWeb(
    `Du researcher for et bokkapittel. Søk etter ferske, verifiserbare fakta og svar med et kompakt research-notat.

Bok: "${project.title}" (${project.niche || ""}, målgruppe: ${project.audience || ""})
Kapittel: "${tocRow.title}" — mål: ${tocRow.goal || ""}

Finn 4-8 punkter som gjør kapittelet konkret og troverdig: tall, funn, konkrete eksempler, vanlige misforståelser. For hvert punkt: én setning + kilde (navn/år eller URL). Ta bare med det du faktisk fant dekning for — ingen gjetning. Avslutt med 1-2 «bruk forsiktig»-advarsler hvis noe er omstridt.`,
    { maxTokens: 1800, maxSearches: 4 },
  );
  return brief.slice(0, 5000);
}

async function writeChapterTwoPass(
  project: Record<string, any>,
  tocRow: Record<string, any>,
  bible: BookBible,
  previousTail: string,
) {
  const craft = resolveCraft(project.genre);
  const voice = voiceForPrompt(project.metadata_plan?.voice_sample);
  const targetWords = Math.min(Math.max(Number(tocRow.target_words || 1800), 900), 4000);
  const sourceMaterial = String(project.metadata_plan?.source_material || "").slice(0, 8000);
  const research = await researchChapter(project, tocRow, craft.id);

  const draftPrompt = `
Du er en prisbelønt forfatter som skriver et helt kapittel i en bok. Returner KUN gyldig JSON.

Bok:
${JSON.stringify(projectContextForWriting(project), null, 2)}

Kapittelet du skal skrive nå:
${JSON.stringify({ title: tocRow.title, goal: tocRow.goal || "", target_words: targetWords }, null, 2)}

BOK-BIBEL (det som allerede er skrevet — bygg videre, ikke gjenta):
${bibleForPrompt(bible)}
${previousTail ? `\nSlutten av forrige kapittel (fortsett flyten herfra):\n---\n${previousTail}\n---` : ""}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}
${sourceMaterial ? `\nKILDEMATERIALE (hold deg til dette for fakta):\n---\n${sourceMaterial}\n---` : ""}
${research ? `\nRESEARCH-NOTAT (verifiserte punkter med kilder — vev inn det som styrker kapittelet, ikke ramse opp; ta med kildehenvisning der du bruker tall/funn):\n---\n${research}\n---` : ""}

Skriv HELE kapittelet på ${project.language === "no" ? "norsk" : project.language || "en"}, ca. ${targetWords} ord, i markdown.

JSON schema:
{ "draft": "string (hele kapittelet)" }
`;
  const draftRaw = await askClaude(draftPrompt, { model: "sonnet", maxTokens: 8000, temperature: 0.6 });
  let draft = sanitizeDraftText(safeJsonParse<{ draft?: string }>(draftRaw, {}).draft || draftRaw);
  if (!draft) throw new Error(`Fikk ikke skrevet kapittelet «${tocRow.title}».`);

  const critiquePrompt = `
Du er en nådeløs, konstruktiv forlagsredaktør. Returner KUN gyldig JSON.

Vurder kapittelutkastet mot rubrikken. Vær konkret — pek på setninger og avsnitt.

RUBRIKK (${craft.label}):
${craft.critique_rubric}

BOK-BIBEL (sjekk konsistens):
${bibleForPrompt(bible, 2500)}

Kapittel «${tocRow.title}»:
---
${draft.slice(0, 22000)}
---

JSON schema:
{ "score": 7, "must_fix": ["string (konkrete, viktigste først, maks 6)"], "keep": ["string (det som fungerer, maks 3)"] }
`;
  const critiqueRaw = await askClaude(critiquePrompt, { model: "sonnet", maxTokens: 1200, temperature: 0.3 });
  const critique = safeJsonParse<{ score?: number; must_fix?: string[]; keep?: string[] }>(critiqueRaw, {});
  const mustFix = asArray<string>(critique.must_fix).map(String).filter(Boolean);
  const initialScore = Math.max(1, Math.min(10, Number(critique.score || 6)));

  if (mustFix.length > 0) {
    const revisePrompt = `
Du er forfatteren og har fått redaktørens kritikk. Returner KUN gyldig JSON.

Revider kapittelet: rett ALT under «must_fix», behold det som fungerer, behold lengden (ca. ${targetWords} ord) og markdown-strukturen. Ikke innfør nye fakta.

Redaktørens krav:
${JSON.stringify(mustFix, null, 2)}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}

Kapittel «${tocRow.title}» (nåværende versjon):
---
${draft.slice(0, 22000)}
---

JSON schema:
{ "draft": "string (hele kapittelet, revidert)" }
`;
    const revisedRaw = await askClaude(revisePrompt, { model: "sonnet", maxTokens: 8000, temperature: 0.5 });
    const revised = sanitizeDraftText(safeJsonParse<{ draft?: string }>(revisedRaw, {}).draft || "");
    if (revised) draft = revised;
  }

  // Kort sammendrag til bok-bibelen, så neste kapittel vet hva dette dekket.
  const summaryRaw = await askClaude(
    `Returner KUN gyldig JSON. Oppsummer kapittelet i 2-3 setninger (hva det dekker og hvordan det slutter), og list eventuelle løfter til leseren om senere kapitler.\n\nKapittel «${tocRow.title}»:\n---\n${draft.slice(0, 12000)}\n---\n\nJSON schema:\n{ "summary": "string", "promises": ["string"] }`,
    { model: "haiku", maxTokens: 400, temperature: 0.2 },
  );
  const summaryParsed = safeJsonParse<{ summary?: string; promises?: string[] }>(summaryRaw, {});

  return {
    chapter_title: String(tocRow.title || "Kapittel"),
    draft,
    research: research ? research.slice(0, 3000) : undefined,
    quality: {
      score: initialScore,
      revised: mustFix.length > 0,
      notes: mustFix.slice(0, 4),
      at: new Date().toISOString(),
    },
    summary: String(summaryParsed.summary || "").trim(),
    promises: asArray<string>(summaryParsed.promises).map(String).filter(Boolean).slice(0, 4),
  };
}

async function generateChapterDraftBatch(project: Record<string, any>, count = 1) {
  const toc = asArray<Record<string, any>>(project.outline_plan?.toc);
  const existingDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const draftedTitles = new Set(existingDrafts.map((d) => normalizeTitleKey(d.chapter_title)));
  const missing = toc.filter((row) => !draftedTitles.has(normalizeTitleKey(row.title))).slice(0, count);
  if (missing.length === 0) return { added: [], done: true, bible: bibleFromMetadata(project.metadata_plan) };

  const bible = bibleFromMetadata(project.metadata_plan);
  const lastDraft = existingDrafts[existingDrafts.length - 1];
  let previousTail = String(lastDraft?.draft || "").slice(-1200);

  const added: Array<Record<string, any>> = [];
  for (const tocRow of missing) {
    try {
      const result = await writeChapterTwoPass(project, tocRow, bible, previousTail);
      added.push({ chapter_title: result.chapter_title, draft: result.draft, quality: result.quality, research: result.research });
      if (result.summary) bible.chapter_summaries.push({ chapter_title: result.chapter_title, summary: result.summary });
      for (const promise of result.promises) {
        if (!bible.promises.includes(promise)) bible.promises.push(promise);
      }
      previousTail = result.draft.slice(-1200);
    } catch (error) {
      console.error(`[Book Engine] Kapittel «${tocRow.title}» feilet:`, error);
      break; // det som er skrevet så langt lagres; neste kall fortsetter
    }
  }

  return { added, done: missing.length <= added.length && toc.length <= existingDrafts.length + added.length, bible };
}

async function generateOutlineIfMissing(project: Record<string, any>) {
  const toc = asArray<Record<string, any>>(project.outline_plan?.toc);
  if (toc.length > 0) return project;

  const prompt = `
Du er en bokstrateg. Returner KUN gyldig JSON.
Lag en tydelig kapitteloversikt (TOC) for prosjektet under.

Prosjekt:
${JSON.stringify(
    {
      title: project.title,
      subtitle: project.subtitle,
      audience: project.audience,
      language: project.language,
      genre: project.genre,
      positioning: project.positioning,
      target_words: project.target_words,
      metadata_plan: project.metadata_plan || {},
    },
    null,
    2,
  )}

JSON schema:
{
  "book_promise": "string",
  "toc": [{"chapter":1,"title":"string","goal":"string","target_words":1200}],
  "writing_plan": [{"week":1,"focus":"string","deliverable":"string"}]
}
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2200, temperature: 0.4 });
  const parsed = safeJsonParse<{ book_promise?: string; toc?: Array<Record<string, any>>; writing_plan?: Array<Record<string, any>> }>(
    raw,
    { book_promise: "", toc: [], writing_plan: [] },
  );
  return {
    ...project,
    outline_plan: {
      book_promise: parsed.book_promise || project.outline_plan?.book_promise || "",
      toc: asArray(parsed.toc),
      writing_plan: asArray(parsed.writing_plan),
    },
  };
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

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { projects: [] });
  if (unauthorized) return unauthorized;

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
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const mode = String(body.mode || "create");

  if (mode === "update_project") {
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required for update_project mode" }, { status: 400 });
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof body.series_name !== "undefined") patch.series_name = String(body.series_name || "").trim();
    if (typeof body.genre !== "undefined") patch.genre = String(body.genre || "").trim();
    if (typeof body.title !== "undefined") patch.title = String(body.title || "").trim();
    if (typeof body.subtitle !== "undefined") patch.subtitle = String(body.subtitle || "").trim();

    const { data, error } = await supabase
      .from("publishing_book_projects")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, mode: "update_project", project: data });
  }

  if (mode === "retry_generation") {
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required for retry_generation mode" }, { status: 400 });
    const { data: project, error: loadError } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

    const current = project as Record<string, any>;
    await supabase
      .from("publishing_book_projects")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", id);

    try {
      const input = {
        brand_id: String(current.brand_id || "freddypublishing"),
        title: String(current.title || "").trim(),
        subtitle: String(current.subtitle || "").trim(),
        language: String(current.language || "en"),
        niche: String(current.niche || "olive_oil_mediterranean"),
        genre: String(current.genre || "guide"),
        series_name: String(current.series_name || ""),
        audience: String(current.audience || "health-conscious readers 40+"),
        positioning: String(current.positioning || ""),
        target_words: Number(current.target_words || 30000),
        target_pages: Number(current.target_pages || 180),
        seed_keywords: asKeywords(current.seed_keywords),
        source_mode: String(current.metadata_plan?.source_mode || "from_brief"),
        source_material: String(current.metadata_plan?.source_material || ""),
        source_instructions: String(current.metadata_plan?.source_instructions || ""),
      };
      const seriesContext = await loadSeriesContext(supabase, input.series_name);
      const enrichedInput = { ...input, series_context: seriesContext };
      const seoPlan = await generateSeoPlan(enrichedInput);
      const authorPlan = await generateAuthorPlan(enrichedInput, seoPlan, 2);
      const fallbackProject = {
        ...current,
        metadata_plan: seoPlan,
        outline_plan: {
          book_promise: authorPlan.book_promise || "",
          toc: asArray(authorPlan.toc),
          writing_plan: asArray(authorPlan.writing_plan),
        },
        chapter_drafts: asArray(authorPlan.sample_chapters),
      };
      const projectWithOutline = await generateOutlineIfMissing(fallbackProject);
      const existingDrafts = asArray<Record<string, any>>(current.chapter_drafts);
      let chapterDrafts = asArray(authorPlan.sample_chapters);
      let bookBible = bibleFromMetadata(current.metadata_plan);
      if (chapterDrafts.length === 0) {
        const batch = await generateChapterDraftBatch(projectWithOutline, 1);
        chapterDrafts = batch.added;
        bookBible = batch.bible;
      }
      const mergedDrafts = mergeChapterDrafts(existingDrafts, chapterDrafts);
      const finalOutlinePlan = projectWithOutline.outline_plan || fallbackProject.outline_plan || {};
      const hasToc = asArray(finalOutlinePlan?.toc).length > 0;
      const hasDrafts = asArray(mergedDrafts).length > 0;
      const finalStatus = hasToc && hasDrafts ? "generated" : "drafting";
      const revisionReport = await generateRevisionReport(enrichedInput, authorPlan);
      const { data, error } = await supabase
        .from("publishing_book_projects")
        .update({
          status: finalStatus,
          metadata_plan: {
            ...(current.metadata_plan || {}),
            ...seoPlan,
            book_bible: bookBible,
            revision_report: revisionReport,
            generation_state: hasToc && hasDrafts ? "author_ready" : "author_partial",
            ...(hasToc && hasDrafts
              ? {}
              : {
                  generation_warning:
                    "Outline ble laget, men ingen kapittelutkast enda. Trykk Fortsett skriv for å generere kapittelutkast.",
                }),
          },
          outline_plan: finalOutlinePlan,
          chapter_drafts: mergedDrafts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, mode: "retry_generation", project: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not retry generation";
      const { data } = await supabase
        .from("publishing_book_projects")
        .update({
          status: "generation_failed",
          metadata_plan: {
            ...(current.metadata_plan || {}),
            generation_state: "failed",
            generation_error: message,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      return NextResponse.json({ success: true, mode: "retry_generation", warning: message, project: data || current });
    }
  }

  if (mode === "generate_seo") {
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required for generate_seo mode" }, { status: 400 });
    const { data: project, error: loadError } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    const current = project as Record<string, any>;
    const input = {
      brand_id: String(current.brand_id || "freddypublishing"),
      title: String(current.title || "").trim(),
      subtitle: String(current.subtitle || "").trim(),
      language: String(current.language || "en"),
      niche: String(current.niche || "olive_oil_mediterranean"),
      genre: String(current.genre || "guide"),
      series_name: String(current.series_name || ""),
      audience: String(current.audience || "health-conscious readers 40+"),
      positioning: String(current.positioning || ""),
      target_words: Number(current.target_words || 30000),
      target_pages: Number(current.target_pages || 180),
      seed_keywords: asKeywords(current.seed_keywords),
      illustration_style: String(current.metadata_plan?.illustration_style || ""),
      consistency_notes: String(current.metadata_plan?.consistency_notes || ""),
      recurring_characters: asKeywords(current.metadata_plan?.recurring_characters),
      source_mode: String(current.metadata_plan?.source_mode || "from_brief"),
      source_material: String(current.metadata_plan?.source_material || ""),
      source_instructions: String(current.metadata_plan?.source_instructions || ""),
    };
    try {
      const seriesContext = await loadSeriesContext(supabase, input.series_name);
      const enrichedInput = { ...input, series_context: seriesContext };
      const seoPlan = await generateSeoPlan(enrichedInput);
      const mergedMetadata = {
        ...(current.metadata_plan || {}),
        ...seoPlan,
        generation_state: "seo_ready",
      };
      const { data, error } = await supabase
        .from("publishing_book_projects")
        .update({ metadata_plan: mergedMetadata, status: "drafting", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, mode: "generate_seo", project: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate SEO";
      await supabase
        .from("publishing_book_projects")
        .update({
          status: "generation_failed",
          metadata_plan: { ...(current.metadata_plan || {}), generation_state: "seo_failed", generation_error: message },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (mode === "generate_author") {
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required for generate_author mode" }, { status: 400 });
    const { data: project, error: loadError } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    const current = project as Record<string, any>;
    const input = {
      brand_id: String(current.brand_id || "freddypublishing"),
      title: String(current.title || "").trim(),
      subtitle: String(current.subtitle || "").trim(),
      language: String(current.language || "en"),
      niche: String(current.niche || "olive_oil_mediterranean"),
      genre: String(current.genre || "guide"),
      series_name: String(current.series_name || ""),
      audience: String(current.audience || "health-conscious readers 40+"),
      positioning: String(current.positioning || ""),
      target_words: Number(current.target_words || 30000),
      target_pages: Number(current.target_pages || 180),
      seed_keywords: asKeywords(current.seed_keywords),
      illustration_style: String(current.metadata_plan?.illustration_style || ""),
      consistency_notes: String(current.metadata_plan?.consistency_notes || ""),
      recurring_characters: asKeywords(current.metadata_plan?.recurring_characters),
      source_mode: String(current.metadata_plan?.source_mode || "from_brief"),
      source_material: String(current.metadata_plan?.source_material || ""),
      source_instructions: String(current.metadata_plan?.source_instructions || ""),
    };
    try {
      const seriesContext = await loadSeriesContext(supabase, input.series_name);
      const enrichedInput = { ...input, series_context: seriesContext };
      const seoPlan = (current.metadata_plan || {}) as Record<string, any>;
      const authorPlan = await generateAuthorPlan(enrichedInput, seoPlan, 2);
      const fallbackProject = {
        ...current,
        metadata_plan: seoPlan,
        outline_plan: {
          book_promise: authorPlan.book_promise || "",
          toc: asArray(authorPlan.toc),
          writing_plan: asArray(authorPlan.writing_plan),
        },
        chapter_drafts: asArray(authorPlan.sample_chapters),
      };
      const projectWithOutline = await generateOutlineIfMissing(fallbackProject);
      const existingDrafts = asArray<Record<string, any>>(current.chapter_drafts);
      let chapterDrafts = asArray(authorPlan.sample_chapters);
      let bookBible = bibleFromMetadata(current.metadata_plan);
      if (chapterDrafts.length === 0) {
        const batch = await generateChapterDraftBatch(projectWithOutline, 1);
        chapterDrafts = batch.added;
        bookBible = batch.bible;
      }
      const mergedDrafts = mergeChapterDrafts(existingDrafts, chapterDrafts);
      const finalOutlinePlan = projectWithOutline.outline_plan || fallbackProject.outline_plan || {};
      const hasToc = asArray(finalOutlinePlan?.toc).length > 0;
      const hasDrafts = asArray(mergedDrafts).length > 0;
      const finalStatus = hasToc && hasDrafts ? "generated" : "drafting";
      const revisionReport = await generateRevisionReport(enrichedInput, authorPlan);
      const { data, error } = await supabase
        .from("publishing_book_projects")
        .update({
          status: finalStatus,
          outline_plan: finalOutlinePlan,
          chapter_drafts: mergedDrafts,
          metadata_plan: {
            ...(current.metadata_plan || {}),
            book_bible: bookBible,
            generation_state: hasToc && hasDrafts ? "author_ready" : "author_partial",
            revision_report: revisionReport,
            ...(hasToc && hasDrafts
              ? {}
              : {
                  generation_warning:
                    "Outline ble laget, men ingen kapittelutkast enda. Trykk Fortsett skriv for å generere kapittelutkast.",
                }),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, mode: "generate_author", project: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate author plan";
      await supabase
        .from("publishing_book_projects")
        .update({
          status: "generation_failed",
          metadata_plan: { ...(current.metadata_plan || {}), generation_state: "author_failed", generation_error: message },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (mode === "continue") {
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required for continue mode" }, { status: 400 });
    // To-pass-skriving er grundig og treg — maks 2 kapitler per kall.
    const chapterCount = Math.min(Math.max(Number(body.chapter_count || 1), 1), 2);
    const { data: project, error: loadError } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

    const projectWithOutline = await generateOutlineIfMissing(project as Record<string, any>);
    const outlinePlan = projectWithOutline.outline_plan || (project as any).outline_plan || {};
    const tocCount = asArray(outlinePlan?.toc).length;
    if (tocCount === 0) {
      return NextResponse.json(
        {
          error:
            "Fant ingen kapitteloversikt (TOC) på prosjektet. Kjør Prøv igjen først for å bygge outline, og trykk deretter Fortsett skriv.",
        },
        { status: 400 },
      );
    }

    const batch = await generateChapterDraftBatch(projectWithOutline, chapterCount);
    const existing = asArray((project as any).chapter_drafts);
    const seen = new Set(existing.map((d: any) => normalizeTitleKey(d?.chapter_title)));
    const uniqueAdded = batch.added.filter((d) => {
      const key = normalizeTitleKey(d.chapter_title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const mergedDrafts = mergeChapterDrafts(existing, uniqueAdded);
    const hasAnyDrafts = mergedDrafts.length > 0;
    const { data, error } = await supabase
      .from("publishing_book_projects")
      .update({
        outline_plan: outlinePlan,
        chapter_drafts: mergedDrafts,
        metadata_plan: { ...((project as any).metadata_plan || {}), book_bible: batch.bible },
        status: batch.done && hasAnyDrafts ? "ready_for_export" : "drafting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      mode: "continue",
      added: uniqueAdded.length,
      warning:
        uniqueAdded.length === 0
          ? "La til 0 nye kapittelutkast. Prøv igjen eller bytt språk/stil for dette prosjektet."
          : null,
      project: data,
    });
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
        style_guide: planned.style_guide || "",
        character_bible: asArray(planned.character_bible),
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
    illustration_style: String(body.illustration_style || ""),
    consistency_notes: String(body.consistency_notes || ""),
    recurring_characters: asKeywords(body.recurring_characters),
    source_mode: String(body.source_mode || "from_brief"),
    source_material: String(body.source_material || ""),
    source_instructions: String(body.source_instructions || ""),
  };

  const baseInsertPayload = {
    brand_id: input.brand_id,
    title: input.title,
    subtitle: input.subtitle,
    language: input.language,
    niche: input.niche,
    genre: input.genre,
    series_name: input.series_name,
    audience: input.audience,
    positioning: input.positioning,
    target_words: input.target_words,
    target_pages: input.target_pages,
    seed_keywords: input.seed_keywords,
    status: "generating",
    metadata_plan: {
      generation_state: "started",
      illustration_style: input.illustration_style,
      consistency_notes: input.consistency_notes,
      recurring_characters: input.recurring_characters,
      source_mode: input.source_mode,
      source_material: input.source_material ? input.source_material.slice(0, 60000) : "",
      source_instructions: input.source_instructions,
    },
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
  return NextResponse.json({ success: true, project: createdProject, queued: true });
}
