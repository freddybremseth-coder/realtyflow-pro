import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";
import { bibleForPrompt, bibleFromMetadata, resolveCraft, voiceForPrompt } from "@/lib/author-craft";

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

/**
 * AI-basert kapitteldeling for manus uten gjenkjennbare overskrifter
 * (typisk PDF-uttrekk der formateringen er borte). Modellen peker ut
 * kapittelgrensene ved å KOPIERE de første tegnene i hvert kapittel
 * eksakt; vi splitter så teksten på disse markørene. Feiler markørene,
 * deles manuset mekanisk i ~2200-ords deler så det aldri blir stående
 * som ett gigantisk kapittel.
 */
async function aiSplitChapters(text: string): Promise<Chapter[]> {
  const sample = text.slice(0, 90000);
  try {
    const raw = await askClaude(
      `Du er en manusredaktør som skal finne kapittelgrensene i et manus der formateringen har gått tapt. Returner KUN gyldig JSON.

For hvert kapittel/naturlige hovedavsnitt:
- "title": kort, beskrivende kapitteltittel
- "start_marker": de FØRSTE 30-60 tegnene av kapittelets første setning, KOPIERT HELT EKSAKT fra teksten under (samme tegnsetting og stor/liten bokstav — ingen omskriving)

Finn 5-25 kapitler avhengig av manusets lengde og struktur.

Manus:
---
${sample}
---

JSON schema:
{ "chapters": [{ "title": "string", "start_marker": "string" }] }`,
      { model: "sonnet", maxTokens: 2500, temperature: 0.2 },
    );
    const parsed = safeJsonParse<{ chapters?: Array<{ title?: string; start_marker?: string }> }>(raw, {});
    const markers = asArray(parsed.chapters)
      .map((c) => ({ title: String(c?.title || "").trim(), marker: String(c?.start_marker || "").trim() }))
      .filter((c) => c.title && c.marker.length >= 10);

    const found: Array<{ title: string; index: number }> = [];
    let cursor = 0;
    for (const m of markers) {
      const idx = text.indexOf(m.marker, cursor);
      if (idx >= 0) {
        found.push({ title: m.title, index: idx });
        cursor = idx + m.marker.length;
      }
    }
    if (found.length >= 2) {
      const chapters: Chapter[] = [];
      if (found[0].index > 400) chapters.push({ chapter_title: "Innledning", draft: text.slice(0, found[0].index).trim() });
      for (let i = 0; i < found.length; i += 1) {
        const end = i + 1 < found.length ? found[i + 1].index : text.length;
        const body = text.slice(found[i].index, end).trim();
        if (body) chapters.push({ chapter_title: found[i].title, draft: body });
      }
      if (chapters.length >= 2) return chapters;
    }
  } catch (error) {
    console.warn("[Author Studio] AI-kapitteldeling feilet, bruker mekanisk deling:", error);
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3500) return [{ chapter_title: "Manuskript", draft: text }];
  const perPart = 2200;
  const parts: Chapter[] = [];
  for (let i = 0; i < words.length; i += perPart) {
    parts.push({ chapter_title: `Del ${parts.length + 1}`, draft: words.slice(i, i + perPart).join(" ") });
  }
  return parts;
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
  const craft = resolveCraft(project.genre);
  const voice = voiceForPrompt(project.metadata_plan?.voice_sample);
  const prompt = `
Du er en prisbelønt forfatter og manusredaktør. Returner KUN gyldig JSON.

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Språk: ${project.language || "no"} (svar på samme språk som kapittelet er skrevet i)
Sjanger: ${craft.label}

Oppgave: ${task}
${instruction ? `Forfatterens instruks: ${instruction}` : ""}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}

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

  const craft = resolveCraft(project.genre);
  const prompt = `
Du er en erfaren forlagsredaktør og bestselgerforfatter. Returner KUN gyldig JSON.

Analyser dette bokmanuset grundig som om forfatteren har hyret deg som personlig
ekspert. Vær konkret og handlingsorientert — ikke generisk.

Sjangerens kvalitetsrubrikk (${craft.label}) — bruk denne aktivt:
${craft.critique_rubric}

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Språk: ${project.language || "no"} · Sjanger: ${craft.label} · Kapitler: ${chapters.length}

Manus (utdrag per kapittel):
${manuscriptSample}

JSON schema:
{
  "overall_score": 7,
  "verdict": "string (2-3 setninger, ærlig helhetsvurdering)",
  "strengths": ["string (maks 5)"],
  "weaknesses": ["string (maks 5)"],
  "chapter_notes": [{"chapter_title":"string","note":"string (konkret forbedringsforslag)"}],
  "market_fit": "string (hvem kjøper denne boken og hvorfor)",
  "recommended_actions": ["string (prioritert, mest verdifullt først, maks 6)"]
}

VIKTIG: Returner KOMPAKT JSON. Maks 10 chapter_notes — velg kapitlene som trenger det mest. Hold hver note under 2 setninger, så hele svaret får plass.
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 6000, temperature: 0.35 });
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

      let chapters = splitManuscript(manuscript);
      // PDF-uttrekk mister ofte overskriftene — la AI-en finne kapittelgrensene.
      if (chapters.length === 1 && manuscript.length > 6000) {
        chapters = await aiSplitChapters(manuscript);
      }
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

    // Manuell import: manus (PDF/Word/tekst) som IKKE hører til en bok i
    // katalogen — blir et frittstående manusprosjekt i studioet.
    if (mode === "import_manuscript") {
      const title = String(body.title || "").trim();
      const manuscript = String(body.manuscript || "").trim();
      if (!title) return NextResponse.json({ error: "Tittel mangler." }, { status: 400 });
      if (!manuscript) return NextResponse.json({ error: "Lim inn eller last opp manuskriptet." }, { status: 400 });

      let chapters = splitManuscript(manuscript);
      // PDF-uttrekk mister ofte overskriftene — la AI-en finne kapittelgrensene.
      if (chapters.length === 1 && manuscript.length > 6000) {
        chapters = await aiSplitChapters(manuscript);
      }
      const { data: project, error } = await supabase
        .from("publishing_book_projects")
        .insert({
          brand_id: "freddypublishing",
          title,
          subtitle: String(body.subtitle || "").trim(),
          language: String(body.language || "no"),
          genre: String(body.genre || "guide"),
          status: "ready_for_export",
          metadata_plan: { imported_manuscript: true, imported_at: new Date().toISOString() },
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
      if (String(chapter.draft || "").length > 30000) {
        return NextResponse.json(
          { error: "Kapittelet er for langt til trygg AI-redigering (hele endringen ville ikke fått plass). Bruk «Del opp i kapitler» først, og rediger deretter kapittel for kapittel." },
          { status: 400 },
        );
      }

      // «Løft»: målrettet omskriving som retter redaktørens konkrete notater
      // fra kvalitetsvurderingen — og scorer kapittelet på nytt etterpå.
      const liftNotes = asArray<string>(chapter.quality?.notes).map(String).filter(Boolean);
      const effectiveInstruction =
        action === "lift"
          ? `Løft kapittelet til publiseringsnivå (mål: 8+/10). Rett SPESIFIKT disse punktene fra redaktøren:\n${
              liftNotes.length ? liftNotes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "- Stram språket, konkretiser abstraksjoner, styrk åpning og avslutning."
            }\nBehold alt faktainnhold og omtrent samme lengde.`
          : instruction;

      const result = await runChapterEdit(project, chapter, action === "lift" ? "custom" : action, effectiveInstruction);

      let newQuality: Record<string, any> | undefined;
      if (action === "lift") {
        const craft = resolveCraft(project.genre);
        const scoreRaw = await askClaude(
          `Du er en streng forlagsredaktør. Returner KUN gyldig JSON.\n\nVurder kapittelet mot rubrikken. Score 1-10 der 8+ er utgivelsesklart.\n\nRUBRIKK (${craft.label}):\n${craft.critique_rubric}\n\nKapittel «${chapter.chapter_title}»:\n---\n${result.draft.slice(0, 20000)}\n---\n\nJSON schema:\n{ "score": 8, "notes": ["string (maks 3)"] }`,
          { model: "sonnet", maxTokens: 700, temperature: 0.3 },
        );
        const scored = safeJsonParse<{ score?: number; notes?: string[] }>(scoreRaw, {});
        newQuality = {
          score: Math.max(1, Math.min(10, Number(scored.score || 7))),
          notes: asArray<string>(scored.notes).map(String).slice(0, 3),
          at: new Date().toISOString(),
        };
      }

      chapters[index] = {
        ...chapter,
        previous_draft: chapter.draft,
        draft: result.draft,
        last_edit: { action, instruction: effectiveInstruction.slice(0, 500), summary: result.changeSummary, at: new Date().toISOString() },
        formatted: false,
        quality: newQuality, // undefined for vanlige endringer — scoren gjelder ikke lenger
      };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({
        success: true,
        mode,
        chapter_title: chapter.chapter_title,
        change_summary: result.changeSummary,
        new_score: newQuality?.score ?? null,
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
      chapters[index] = { ...chapter, draft, quality: undefined };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // «Skriv på nytt»: lag en forbedret/endret utgave av hele boken etter
    // forfatterens instruks. Oppretter et NYTT prosjekt med revidert
    // kapitteloversikt der hvert kapittel peker på kildekapittelet det
    // bygger på (eller er markert som nytt). Selve omskrivingen kjøres
    // kapittel for kapittel via rewrite_continue.
    if (mode === "rewrite_book") {
      const instruction = String(body.instruction || "").trim();
      if (!instruction) return NextResponse.json({ error: "Skriv en instruks for omskrivingen." }, { status: 400 });
      if (chapters.length === 0) {
        return NextResponse.json({ error: "Prosjektet har ingen kapitler å skrive om." }, { status: 400 });
      }

      const craft = resolveCraft(project.genre);
      const chapterOverview = chapters.map((c, i) => ({
        index: i + 1,
        title: c.chapter_title,
        excerpt: String(c.draft || "").slice(0, 400),
        words: wordCount(c.draft),
      }));

      const planRaw = await askClaude(
        `Du er en bokstrateg som planlegger en revidert utgave. Returner KUN gyldig JSON.

Eksisterende bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""} (${craft.label}, ${project.language || "no"})
Kapitler i dag:
${JSON.stringify(chapterOverview, null, 2)}

FORFATTERENS INSTRUKS for den nye utgaven:
${instruction}

Lag kapitteloversikten for den reviderte utgaven:
- Behold alt instruksen sier skal beholdes; legg til/endre det den ber om.
- Hvert kapittel som bygger på et eksisterende, skal ha source_chapter satt til den EKSAKTE gamle tittelen. Helt nye kapitler har source_chapter: null.
- Sett realistiske target_words (bruk gamle ordtall som utgangspunkt, 1200-3000 for nye).

JSON schema:
{
  "title": "string (behold med mindre instruksen ber om nytt)",
  "subtitle": "string",
  "toc": [{"chapter":1,"title":"string","goal":"string","target_words":1800,"source_chapter":"string|null"}]
}`,
        { model: "sonnet", maxTokens: 3000, temperature: 0.35 },
      );
      const plan = safeJsonParse<{ title?: string; subtitle?: string; toc?: Array<Record<string, any>> }>(planRaw, {});
      const toc = asArray<Record<string, any>>(plan.toc);
      if (toc.length === 0) return NextResponse.json({ error: "Klarte ikke å planlegge den nye utgaven. Prøv igjen." }, { status: 500 });

      const { data: edition, error } = await supabase
        .from("publishing_book_projects")
        .insert({
          brand_id: "freddypublishing",
          title: String(plan.title || project.title),
          subtitle: String(plan.subtitle || project.subtitle || ""),
          language: project.language || "no",
          niche: project.niche || null,
          genre: project.genre || null,
          series_name: project.series_name || null,
          audience: project.audience || null,
          positioning: project.positioning || null,
          status: "rewriting",
          parent_project_id: project.id,
          source_book_id: project.source_book_id || null,
          metadata_plan: {
            rewrite_of: project.id,
            rewrite_instruction: instruction,
            rewrite_total: toc.length,
            voice_sample: project.metadata_plan?.voice_sample || "",
            source_material: project.metadata_plan?.source_material || "",
          },
          outline_plan: { book_promise: "", toc, writing_plan: [] },
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
        message: `Revidert utgave planlagt med ${toc.length} kapitler. Kjør «Fortsett omskriving» til alt er skrevet.`,
      });
    }

    // Skriv neste kapittel i en omskriving — ett kapittel per kall.
    if (mode === "rewrite_continue") {
      const sourceId = String(project.metadata_plan?.rewrite_of || "");
      const instruction = String(project.metadata_plan?.rewrite_instruction || "");
      if (!sourceId) return NextResponse.json({ error: "Dette prosjektet er ikke en omskriving." }, { status: 400 });
      const sourceProject = await loadProject(supabase, sourceId).catch(() => null);
      const sourceChapters = sourceProject ? asArray<Chapter>(sourceProject.chapter_drafts) : [];

      const toc = asArray<Record<string, any>>((project as any).outline_plan?.toc);
      const done = chapters.length;
      if (done >= toc.length) {
        const updated = await saveChapters(supabase, projectId, chapters, { status: "ready_for_export" });
        return NextResponse.json({ success: true, mode, written: 0, remaining: 0, project: updated });
      }

      const tocRow = toc[done];
      const craft = resolveCraft(project.genre);
      const voice = voiceForPrompt(project.metadata_plan?.voice_sample);
      const bible = bibleFromMetadata(project.metadata_plan);
      const targetWords = Math.min(Math.max(Number(tocRow.target_words || 1800), 800), 4000);
      const sourceKey = normalizeTitleKey(tocRow.source_chapter);
      const sourceChapter = sourceKey
        ? sourceChapters.find((c) => normalizeTitleKey(c.chapter_title) === sourceKey)
        : null;

      const prompt = sourceChapter
        ? `Du er en prisbelønt forfatter som skriver en revidert utgave av et kapittel. Returner KUN gyldig JSON.

FORFATTERENS INSTRUKS for hele den nye utgaven (følg den nøyaktig der den treffer dette kapittelet):
${instruction}

Nytt kapittel: "${tocRow.title}" — mål: ${tocRow.goal || ""} (ca. ${targetWords} ord)

BOK-BIBEL for den nye utgaven (ikke gjenta det som alt er skrevet):
${bibleForPrompt(bible)}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}

KILDEKAPITTEL (behold fakta, navn og substans — forbedre språk, struktur og alt instruksen krever; ALDRI finn opp nye fakta):
---
${String(sourceChapter.draft || "").slice(0, 22000)}
---

JSON schema:
{ "draft": "string (hele det nye kapittelet, markdown)" }`
        : `Du er en prisbelønt forfatter som skriver et HELT NYTT kapittel i en revidert bokutgave. Returner KUN gyldig JSON.

FORFATTERENS INSTRUKS for utgaven:
${instruction}

Bok: "${project.title}" (${craft.label}, ${project.language || "no"})
Nytt kapittel: "${tocRow.title}" — mål: ${tocRow.goal || ""} (ca. ${targetWords} ord)

BOK-BIBEL (skriv i samme stil og struktur som resten — se sammendragene):
${bibleForPrompt(bible)}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}
${project.metadata_plan?.source_material ? `\nKILDEMATERIALE:\n---\n${String(project.metadata_plan.source_material).slice(0, 6000)}\n---` : ""}

Ikke finn opp fakta du ikke har dekning for — er noe usikkert, formuler forsiktig.

JSON schema:
{ "draft": "string (hele kapittelet, markdown)" }`;

      const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 8000, temperature: 0.5 });
      const draft = String(safeJsonParse<{ draft?: string }>(raw, {}).draft || "").trim();
      if (!draft) return NextResponse.json({ error: `Kapittelet «${tocRow.title}» feilet — prøv igjen.` }, { status: 500 });

      const summaryRaw = await askClaude(
        `Returner KUN gyldig JSON. Oppsummer kapittelet i 2 setninger.\n\n«${tocRow.title}»:\n---\n${draft.slice(0, 10000)}\n---\n\nJSON schema: { "summary": "string" }`,
        { model: "haiku", maxTokens: 300, temperature: 0.2 },
      );
      const summary = String(safeJsonParse<{ summary?: string }>(summaryRaw, {}).summary || "").trim();
      if (summary) bible.chapter_summaries.push({ chapter_title: String(tocRow.title), summary });

      const merged = [...chapters, {
        chapter_title: String(tocRow.title),
        draft,
        rewritten_from: sourceChapter ? sourceChapter.chapter_title : null,
      }];
      const allDone = merged.length >= toc.length;
      const updated = await saveChapters(supabase, projectId, merged, {
        status: allDone ? "ready_for_export" : "rewriting",
        metadata_plan: { ...(project.metadata_plan || {}), book_bible: bible, rewrite_done: merged.length },
      });
      return NextResponse.json({
        success: true,
        mode,
        written: 1,
        remaining: Math.max(0, toc.length - merged.length),
        project: updated,
      });
    }

    // Konsistenspass: «les hele boken» og finn gjentakelser, brutte løfter,
    // terminologisprik, tonebrudd og selvmotsigelser på tvers av kapitler.
    if (mode === "consistency_check") {
      if (chapters.length < 2) {
        return NextResponse.json({ error: "Konsistenspasset trenger minst to kapitler." }, { status: 400 });
      }
      const craft = resolveCraft(project.genre);
      // Komprimert helbok: åpning + slutt av hvert kapittel, budsjett ~40k tegn.
      const perChapter = Math.max(600, Math.floor(40000 / chapters.length / 2));
      const compressed = chapters
        .map((c, i) => {
          const text = String(c.draft || "");
          const head = text.slice(0, perChapter);
          const tail = text.length > perChapter * 2 ? text.slice(-perChapter) : "";
          return `### Kapittel ${i + 1}: ${c.chapter_title}\n[ÅPNING]\n${head}${tail ? `\n[SLUTT]\n${tail}` : ""}`;
        })
        .join("\n\n");
      const bible = (project.metadata_plan || {}).book_bible;

      const raw = await askClaude(
        `Du er hovedredaktør og leser hele bokmanuset i sammenheng. Returner KUN gyldig JSON.

Finn problemer som bare synes på tvers av kapitler — ikke setningsnivå (det tas i kapittelredigering):
1. GJENTAKELSER: samme poeng, eksempel eller formulering brukt i flere kapitler
2. BRUTTE LØFTER: «som vi skal se senere»-løfter som aldri innfris
3. TERMINOLOGI: samme begrep omtalt med ulike ord, eller ulikt definert
4. TONEBRUDD: kapitler som skiller seg markant i stemme eller stil
5. SELVMOTSIGELSER: påstander/fakta/råd som strider mot hverandre
6. STRUKTUR: kapitler i feil rekkefølge, hull i progresjonen

Sjanger: ${craft.label} · Bok: "${project.title}" · ${chapters.length} kapitler
${bible ? `\nBok-bibel (løfter og terminologi):\n${JSON.stringify(bible).slice(0, 3000)}` : ""}

Manus (åpning + slutt per kapittel):
${compressed}

JSON schema:
{
  "overall": "string (2-3 setninger: henger boken sammen som ett verk?)",
  "issues": [{"type":"gjentakelse|brutt_løfte|terminologi|tonebrudd|selvmotsigelse|struktur","chapters":["kapitteltitler"],"issue":"string (konkret)","fix":"string (konkret grep)"}],
  "reading_order_ok": true
}`,
        { model: "sonnet", maxTokens: 3000, temperature: 0.3 },
      );
      const report = safeJsonParse(raw, {
        overall: "Kunne ikke fullføre konsistenspasset. Prøv igjen.",
        issues: [] as Array<Record<string, string>>,
        reading_order_ok: true,
      });
      const updated = await saveChapters(supabase, projectId, chapters, {
        metadata_plan: {
          ...(project.metadata_plan || {}),
          consistency_report: { ...report, checked_at: new Date().toISOString() },
        },
      });
      return NextResponse.json({ success: true, mode, report, project: updated });
    }

    // Legg til et nytt kapittel manuelt — f.eks. «Om forfatteren» først i
    // boken. Teksten kan limes inn som den er, eller poleres av AI-en i
    // forfatterens stemme før den lagres.
    if (mode === "add_chapter") {
      const chapterTitle = String(body.chapter_title || "").trim();
      let draft = String(body.draft || "").trim();
      const position = String(body.position || "end");
      const polish = Boolean(body.polish);
      if (!chapterTitle) return NextResponse.json({ error: "Kapittelet trenger en tittel." }, { status: 400 });
      if (!draft) return NextResponse.json({ error: "Lim inn teksten til kapittelet." }, { status: 400 });
      if (findChapter(chapters, chapterTitle).chapter) {
        return NextResponse.json({ error: "Det finnes allerede et kapittel med denne tittelen." }, { status: 400 });
      }

      if (polish && draft.length <= 30000) {
        const craft = resolveCraft(project.genre);
        const voice = voiceForPrompt(project.metadata_plan?.voice_sample);
        const raw = await askClaude(
          `Du er en prisbelønt forfatter og redaktør. Returner KUN gyldig JSON.

Poler teksten under til et ferdig bokkapittel med tittelen «${chapterTitle}» i boken "${project.title}" (${project.language || "no"}).
Behold ALT innhold og alle fakta — forbedre kun språk, flyt, avsnitt og struktur (markdown). Ikke legg til noe nytt.
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}

Tekst:
---
${draft.slice(0, 24000)}
---

JSON schema:
{ "draft": "string (hele kapittelet, polert)" }`,
          { model: "sonnet", maxTokens: 8000, temperature: 0.4 },
        );
        const polished = String(safeJsonParse<{ draft?: string }>(raw, {}).draft || "").trim();
        if (polished) draft = polished;
      }

      const newChapter: Chapter = { chapter_title: chapterTitle, draft };
      const nextChapters =
        position === "start" ? [newChapter, ...chapters] : [...chapters, newChapter];
      const updated = await saveChapters(supabase, projectId, nextChapters, {
        outline_plan: {
          ...((project as any).outline_plan || {}),
          toc: nextChapters.map((c, i) => ({ chapter: i + 1, title: c.chapter_title, goal: "", target_words: wordCount(c.draft) })),
        },
      });
      return NextResponse.json({ success: true, mode, chapter_title: chapterTitle, project: updated });
    }

    // Del et manus som ligger i ett (eller få, store) kapitler opp i ekte
    // kapitler med AI — for PDF-er der overskriftene gikk tapt i uttrekket.
    if (mode === "split_chapters") {
      const fullText = chapters.map((c) => String(c.draft || "")).join("\n\n").trim();
      if (!fullText) return NextResponse.json({ error: "Prosjektet har ingen tekst å dele opp." }, { status: 400 });
      const split = await aiSplitChapters(fullText);
      if (split.length < 2) {
        return NextResponse.json({ error: "Fant ingen tydelige kapittelgrenser — manuset er kanskje for kort." }, { status: 400 });
      }
      const updated = await saveChapters(supabase, projectId, split, {
        outline_plan: {
          ...((project as any).outline_plan || {}),
          toc: split.map((c, i) => ({ chapter: i + 1, title: c.chapter_title, goal: "", target_words: wordCount(c.draft) })),
        },
      });
      return NextResponse.json({ success: true, mode, chapters: split.length, project: updated });
    }

    // Sett bokomslag (generert via /api/image-generate — også med OpenArt).
    if (mode === "set_cover") {
      const coverUrl = String(body.cover_url || "").trim();
      const updated = await saveChapters(supabase, projectId, chapters, {
        metadata_plan: { ...(project.metadata_plan || {}), cover_image_url: coverUrl || null },
      });
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Lagre forfatterens stemmeprøve — brukes i all skriving og redigering.
    if (mode === "save_voice") {
      const voiceSample = String(body.voice_sample || "").slice(0, 12000);
      const updated = await saveChapters(supabase, projectId, chapters, {
        metadata_plan: { ...(project.metadata_plan || {}), voice_sample: voiceSample },
      });
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Kvalitetsscore: vurder kapitler mot sjangerens rubrikk — batch på 3.
    if (mode === "score_chapters") {
      const craft = resolveCraft(project.genre);
      const pending = chapters
        .map((c, index) => ({ c, index }))
        .filter(({ c }) => !c.quality?.score && String(c.draft || "").trim());
      const batch = pending.slice(0, 3);
      if (batch.length === 0) {
        return NextResponse.json({ success: true, mode, scored: 0, remaining: 0, project });
      }
      let scored = 0;
      for (const { c, index } of batch) {
        const raw = await askClaude(
          `Du er en streng forlagsredaktør. Returner KUN gyldig JSON.\n\nVurder kapittelet mot rubrikken. Score 1-10 der 8+ er utgivelsesklart.\n\nRUBRIKK (${craft.label}):\n${craft.critique_rubric}\n\nKapittel «${c.chapter_title}»:\n---\n${String(c.draft || "").slice(0, 20000)}\n---\n\nJSON schema:\n{ "score": 7, "notes": ["string (det viktigste å forbedre, maks 3)"] }`,
          { model: "sonnet", maxTokens: 700, temperature: 0.3 },
        );
        const parsed = safeJsonParse<{ score?: number; notes?: string[] }>(raw, {});
        chapters[index] = {
          ...c,
          quality: {
            score: Math.max(1, Math.min(10, Number(parsed.score || 5))),
            notes: asArray<string>(parsed.notes).map(String).slice(0, 3),
            at: new Date().toISOString(),
          },
        };
        scored += 1;
      }
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({
        success: true,
        mode,
        scored,
        remaining: Math.max(0, pending.length - scored),
        project: updated,
      });
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
