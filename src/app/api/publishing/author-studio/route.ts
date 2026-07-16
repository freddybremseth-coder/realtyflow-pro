import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";

// ─── AI Forfatterstudio ──────────────────────────────────────────────────────
// Ett sted for hele forfatterskapet: utgitte bøker (publishing_books) og
// kladd/prosjekter (publishing_book_projects) side om side. AI-en fungerer som
// ekspertforfatter og redaktør: analyser, forbedre, utvid, gjør om, formater
// og oversett — kapittel for kapittel, uten å miste tidligere versjoner.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

type Chapter = Record<string, any> & {
  chapter_title: string;
  draft: string;
  previous_draft?: string;
  image_url?: string | null;
  formatted?: boolean;
};

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
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(value.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeTitleKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wordCount(text: string) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

/**
 * Splitter et innlimt/opplastet manus i kapitler. Prøver markdown-overskrifter
 * og «Kapittel N»/«Chapter N»-linjer; faller tilbake til hele teksten som ett
 * kapittel så importen aldri feiler.
 */
function splitManuscript(raw: string): Chapter[] {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const headingPattern = /^(#{1,3}\s+.+|(?:kapittel|chapter|del|part)\s+\d+.{0,80})$/gim;
  const matches = [...text.matchAll(headingPattern)];
  if (matches.length >= 2) {
    const chapters: Chapter[] = [];
    for (let i = 0; i < matches.length; i += 1) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
      const heading = matches[i][0].replace(/^#{1,3}\s+/, "").trim();
      const body = text.slice(start + matches[i][0].length, end).trim();
      if (body) chapters.push({ chapter_title: heading, draft: body });
    }
    if (chapters.length > 0) {
      const preamble = text.slice(0, matches[0].index ?? 0).trim();
      if (preamble) chapters.unshift({ chapter_title: "Innledning", draft: preamble });
      return chapters;
    }
  }
  return [{ chapter_title: "Manuskript", draft: text }];
}

async function loadProject(supabase: NonNullable<ReturnType<typeof getSupabase>>, id: string) {
  const { data, error } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Record<string, any>;
}

async function saveChapters(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  id: string,
  chapters: Chapter[],
  extraPatch: Record<string, any> = {},
) {
  const { data, error } = await supabase
    .from("publishing_book_projects")
    .update({ chapter_drafts: chapters, updated_at: new Date().toISOString(), ...extraPatch })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, any>;
}

function findChapter(chapters: Chapter[], chapterTitle: string) {
  const key = normalizeTitleKey(chapterTitle);
  const index = chapters.findIndex((c) => normalizeTitleKey(c.chapter_title) === key);
  return { index, chapter: index >= 0 ? chapters[index] : null };
}

// ─── AI-handlinger ───────────────────────────────────────────────────────────

const EDIT_ACTIONS: Record<string, string> = {
  improve:
    "Forbedre kapittelet som en prisbelønt redaktør: strammere språk, bedre flyt, sterkere åpning og avslutning. Behold forfatterens stemme, alle fakta og omtrent samme lengde.",
  expand:
    "Utvid kapittelet med mer dybde: flere eksempler, forklaringer og konkrete detaljer som gir leseren mer verdi. Behold strukturen og forfatterens stemme. Ikke finn opp fakta, personer eller hendelser.",
  simplify:
    "Forenkle kapittelet: kortere setninger, tydeligere språk, lettere å lese. Behold alt meningsinnhold.",
  custom: "Følg instruksen fra forfatteren nøyaktig.",
};

async function runChapterEdit(
  project: Record<string, any>,
  chapter: Chapter,
  action: string,
  instruction: string,
) {
  const task = EDIT_ACTIONS[action] || EDIT_ACTIONS.improve;
  const prompt = `
Du er en prisbelønt forfatter og manusredaktør. Returner KUN gyldig JSON.

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Språk: ${project.language || "no"} (svar på samme språk som kapittelet er skrevet i)
Sjanger: ${project.genre || "sakprosa"}

Oppgave: ${task}
${instruction ? `Forfatterens instruks: ${instruction}` : ""}

Viktige regler:
- ALDRI finn opp fakta, personer, hendelser, datoer eller sitater.
- Behold markdown-struktur hvis kapittelet har det.
- Returner hele det ferdige kapittelet, ikke bare endringene.

Kapittel: "${chapter.chapter_title}"
---
${String(chapter.draft || "").slice(0, 24000)}
---

JSON schema:
{ "draft": "string (hele kapittelet, ferdig redigert)", "change_summary": "string (1-2 setninger om hva som ble gjort)" }
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 8000, temperature: 0.4 });
  const parsed = safeJsonParse<{ draft?: string; change_summary?: string }>(raw, {});
  const draft = String(parsed.draft || "").trim();
  if (!draft) throw new Error("AI-en returnerte ikke et gyldig kapittel. Prøv igjen.");
  return { draft, changeSummary: String(parsed.change_summary || "").trim() };
}

async function runAnalysis(project: Record<string, any>, chapters: Chapter[]) {
  const manuscriptSample = chapters
    .map((c) => `## ${c.chapter_title}\n${String(c.draft || "").slice(0, 2200)}`)
    .join("\n\n")
    .slice(0, 26000);

  const prompt = `
Du er en erfaren forlagsredaktør og bestselgerforfatter. Returner KUN gyldig JSON.

Analyser dette bokmanuset grundig som om forfatteren har hyret deg som personlig
ekspert. Vær konkret og handlingsorientert — ikke generisk.

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Språk: ${project.language || "no"} · Sjanger: ${project.genre || "sakprosa"} · Kapitler: ${chapters.length}

Manus (utdrag per kapittel):
${manuscriptSample}

JSON schema:
{
  "overall_score": 7,
  "verdict": "string (2-3 setninger, ærlig helhetsvurdering)",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "chapter_notes": [{"chapter_title":"string","note":"string (konkret forbedringsforslag)"}],
  "market_fit": "string (hvem kjøper denne boken og hvorfor)",
  "recommended_actions": ["string (prioritert, mest verdifullt først)"]
}
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 3000, temperature: 0.35 });
  return safeJsonParse(raw, {
    overall_score: 0,
    verdict: "Kunne ikke fullføre analysen. Prøv igjen.",
    strengths: [],
    weaknesses: [],
    chapter_notes: [],
    market_fit: "",
    recommended_actions: [],
  });
}

async function translateChapter(chapter: Chapter, targetLanguage: string, bookTitle: string) {
  const prompt = `
Du er en profesjonell litterær oversetter. Returner KUN gyldig JSON.

Oversett kapittelet under til ${targetLanguage}. Behold tone, stemme, struktur og
markdown. Oversett idiomatisk — ikke ord for ord. ALDRI legg til eller fjern innhold.

Bok: "${bookTitle}"
Kapittel: "${chapter.chapter_title}"
---
${String(chapter.draft || "").slice(0, 22000)}
---

JSON schema:
{ "chapter_title": "string (oversatt tittel)", "draft": "string (hele kapittelet oversatt)" }
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 8000, temperature: 0.3 });
  const parsed = safeJsonParse<{ chapter_title?: string; draft?: string }>(raw, {});
  const draft = String(parsed.draft || "").trim();
  if (!draft) throw new Error(`Oversettelsen av "${chapter.chapter_title}" feilet.`);
  return {
    chapter_title: String(parsed.chapter_title || chapter.chapter_title).trim(),
    draft,
  };
}

async function formatChapter(chapter: Chapter, language: string) {
  const prompt = `
Du er en bokdesigner og typograf. Returner KUN gyldig JSON.

Formater kapittelet til ren, profesjonell markdown: tydelige mellomtitler (##/###)
der det er naturlig, avsnitt på 2-5 setninger, punktlister der innholdet er
oppramsing, og uthevinger med måte. IKKE endre ordlyd, mening eller språk (${language}).

Kapittel: "${chapter.chapter_title}"
---
${String(chapter.draft || "").slice(0, 22000)}
---

JSON schema:
{ "draft": "string (hele kapittelet, formatert)" }
`;
  const raw = await askClaude(prompt, { model: "haiku", maxTokens: 8000, temperature: 0.2 });
  const parsed = safeJsonParse<{ draft?: string }>(raw, {});
  const draft = String(parsed.draft || "").trim();
  if (!draft) throw new Error(`Formateringen av "${chapter.chapter_title}" feilet.`);
  return draft;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { books: [], projects: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ books: [], projects: [] });

  const projectId = request.nextUrl.searchParams.get("project_id");
  if (projectId) {
    try {
      const project = await loadProject(supabase, projectId);
      return NextResponse.json({ project });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fant ikke prosjektet.";
      return NextResponse.json({ error: message }, { status: 404 });
    }
  }

  const [booksRes, projectsRes] = await Promise.all([
    supabase
      .from("publishing_books")
      .select("id, title, subtitle, series_name, niche, status, role, format, amazon_url, pdf_path, marketplace")
      .order("title"),
    supabase
      .from("publishing_book_projects")
      .select("id, title, subtitle, language, genre, series_name, status, source_book_id, parent_project_id, chapter_drafts, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const projects = (projectsRes.data || []).map((row: any) => {
    const chapters = asArray<Chapter>(row.chapter_drafts);
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      language: row.language,
      genre: row.genre,
      series_name: row.series_name,
      status: row.status,
      source_book_id: row.source_book_id,
      parent_project_id: row.parent_project_id,
      updated_at: row.updated_at,
      created_at: row.created_at,
      chapters: chapters.length,
      words: chapters.reduce((sum, c) => sum + wordCount(c.draft), 0),
      images: chapters.filter((c) => c.image_url).length,
    };
  });

  return NextResponse.json({
    books: booksRes.data || [],
    projects,
    booksError: booksRes.error?.message || null,
    projectsError: projectsRes.error?.message || null,
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const mode = String(body.mode || "");

  try {
    // Hent en utgitt bok inn i studioet: lag et manuskript-prosjekt av den.
    if (mode === "import_book") {
      const bookId = String(body.book_id || "").trim();
      const manuscript = String(body.manuscript || "").trim();
      if (!bookId) return NextResponse.json({ error: "book_id mangler." }, { status: 400 });
      if (!manuscript) {
        return NextResponse.json(
          { error: "Lim inn eller last opp manuskriptet for å hente boken inn i studioet." },
          { status: 400 },
        );
      }

      const { data: book, error: bookError } = await supabase
        .from("publishing_books")
        .select("id, title, subtitle, series_name, niche")
        .eq("id", bookId)
        .single();
      if (bookError) return NextResponse.json({ error: bookError.message }, { status: 404 });

      const chapters = splitManuscript(manuscript);
      const { data: project, error } = await supabase
        .from("publishing_book_projects")
        .insert({
          brand_id: "freddypublishing",
          title: book.title,
          subtitle: book.subtitle || "",
          language: String(body.language || "en"),
          niche: book.niche || null,
          series_name: book.series_name || null,
          genre: String(body.genre || "guide"),
          status: "ready_for_export",
          source_book_id: book.id,
          metadata_plan: { imported_from_book: true, imported_at: new Date().toISOString() },
          outline_plan: {
            book_promise: "",
            toc: chapters.map((c, i) => ({ chapter: i + 1, title: c.chapter_title, goal: "", target_words: wordCount(c.draft) })),
            writing_plan: [],
          },
          chapter_drafts: chapters,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, mode, project, chapters: chapters.length });
    }

    const projectId = String(body.project_id || "").trim();
    if (!projectId) return NextResponse.json({ error: "project_id mangler." }, { status: 400 });

    // Slett en kladd/et manusprosjekt. Utgitte bøker (publishing_books) røres
    // aldri — kun manuskript-beholderen forsvinner.
    if (mode === "delete_project") {
      const { error } = await supabase.from("publishing_book_projects").delete().eq("id", projectId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, mode, deleted: projectId });
    }

    const project = await loadProject(supabase, projectId);
    const chapters = asArray<Chapter>(project.chapter_drafts);

    // Full manusanalyse fra AI-redaktøren.
    if (mode === "analyze") {
      if (chapters.length === 0) {
        return NextResponse.json({ error: "Prosjektet har ingen kapitler å analysere ennå." }, { status: 400 });
      }
      const review = await runAnalysis(project, chapters);
      const updated = await saveChapters(supabase, projectId, chapters, {
        metadata_plan: {
          ...(project.metadata_plan || {}),
          author_review: { ...review, analyzed_at: new Date().toISOString() },
        },
      });
      return NextResponse.json({ success: true, mode, review, project: updated });
    }

    // AI-redigering av ett kapittel (forbedre/utvid/forenkle/egendefinert).
    if (mode === "edit_chapter") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      const action = String(body.action || "improve");
      const instruction = String(body.instruction || "").trim();
      if (action === "custom" && !instruction) {
        return NextResponse.json({ error: "Skriv hva AI-en skal gjøre med kapittelet." }, { status: 400 });
      }
      const result = await runChapterEdit(project, chapter, action, instruction);
      chapters[index] = {
        ...chapter,
        previous_draft: chapter.draft,
        draft: result.draft,
        last_edit: { action, instruction, summary: result.changeSummary, at: new Date().toISOString() },
        formatted: false,
      };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({
        success: true,
        mode,
        chapter_title: chapter.chapter_title,
        change_summary: result.changeSummary,
        project: updated,
      });
    }

    // Angre siste AI-redigering på et kapittel.
    if (mode === "revert_chapter") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      if (!chapter.previous_draft) {
        return NextResponse.json({ error: "Ingen tidligere versjon å gå tilbake til." }, { status: 400 });
      }
      chapters[index] = { ...chapter, draft: chapter.previous_draft, previous_draft: undefined };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Manuell lagring fra editoren.
    if (mode === "save_chapter") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      const draft = String(body.draft || "");
      if (!draft.trim()) return NextResponse.json({ error: "Kapittelet kan ikke være tomt." }, { status: 400 });
      chapters[index] = { ...chapter, draft };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Koble et generert bilde (fra /api/image-generate) til et kapittel.
    if (mode === "set_chapter_image") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      const imageUrl = String(body.image_url || "").trim();
      chapters[index] = { ...chapter, image_url: imageUrl || null };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Formater kapitler til ren markdown — batch på inntil 3 per kall.
    if (mode === "format") {
      const pending = chapters
        .map((c, index) => ({ c, index }))
        .filter(({ c }) => !c.formatted && String(c.draft || "").trim());
      const batch = pending.slice(0, 3);
      if (batch.length === 0) {
        return NextResponse.json({ success: true, mode, formatted: 0, remaining: 0, project });
      }
      let formatted = 0;
      for (const { c, index } of batch) {
        const draft = await formatChapter(c, String(project.language || "no"));
        chapters[index] = { ...c, previous_draft: c.draft, draft, formatted: true };
        formatted += 1;
      }
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({
        success: true,
        mode,
        formatted,
        remaining: Math.max(0, pending.length - formatted),
        project: updated,
      });
    }

    // Opprett en språkutgave: nytt prosjekt koblet med parent_project_id.
    if (mode === "translate") {
      const targetLanguage = String(body.target_language || "").trim();
      if (!targetLanguage) return NextResponse.json({ error: "Velg målspråk." }, { status: 400 });
      if (chapters.length === 0) {
        return NextResponse.json({ error: "Prosjektet har ingen kapitler å oversette." }, { status: 400 });
      }

      const metaPrompt = `
Du er en litterær oversetter. Returner KUN gyldig JSON.
Oversett tittel og undertittel til ${targetLanguage}:
${JSON.stringify({ title: project.title, subtitle: project.subtitle || "" })}
JSON schema: { "title": "string", "subtitle": "string" }
`;
      const metaRaw = await askClaude(metaPrompt, { model: "haiku", maxTokens: 400, temperature: 0.3 });
      const meta = safeJsonParse<{ title?: string; subtitle?: string }>(metaRaw, {});

      const { data: edition, error } = await supabase
        .from("publishing_book_projects")
        .insert({
          brand_id: "freddypublishing",
          title: String(meta.title || project.title),
          subtitle: String(meta.subtitle || project.subtitle || ""),
          language: targetLanguage,
          niche: project.niche || null,
          genre: project.genre || null,
          series_name: project.series_name || null,
          status: "translating",
          parent_project_id: project.id,
          source_book_id: project.source_book_id || null,
          metadata_plan: {
            translation_of: project.id,
            translation_source_language: project.language || "no",
            translation_total: chapters.length,
            translation_done: 0,
          },
          outline_plan: project.outline_plan || {},
          chapter_drafts: [],
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        success: true,
        mode,
        edition,
        message: `Språkutgave (${targetLanguage}) opprettet. Kjør «Fortsett oversettelse» til alle kapitlene er oversatt.`,
      });
    }

    // Oversett neste kapitler i en språkutgave — batch på 2 per kall.
    if (mode === "translate_continue") {
      const parentId = String(project.parent_project_id || "");
      if (!parentId) {
        return NextResponse.json({ error: "Dette prosjektet er ikke en språkutgave." }, { status: 400 });
      }
      const parent = await loadProject(supabase, parentId);
      const sourceChapters = asArray<Chapter>(parent.chapter_drafts);
      const done = chapters.length;
      const remaining = sourceChapters.slice(done, done + 2);
      if (remaining.length === 0) {
        const updated = await saveChapters(supabase, projectId, chapters, { status: "ready_for_export" });
        return NextResponse.json({ success: true, mode, translated: 0, remaining: 0, project: updated });
      }

      const translated: Chapter[] = [];
      for (const chapter of remaining) {
        translated.push(await translateChapter(chapter, String(project.language || "en"), String(project.title || "")));
      }
      const merged = [...chapters, ...translated];
      const allDone = merged.length >= sourceChapters.length;
      const updated = await saveChapters(supabase, projectId, merged, {
        status: allDone ? "ready_for_export" : "translating",
        metadata_plan: {
          ...(project.metadata_plan || {}),
          translation_total: sourceChapters.length,
          translation_done: merged.length,
        },
      });
      return NextResponse.json({
        success: true,
        mode,
        translated: translated.length,
        remaining: Math.max(0, sourceChapters.length - merged.length),
        project: updated,
      });
    }

    return NextResponse.json({ error: `Ukjent mode: ${mode}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Noe gikk galt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
