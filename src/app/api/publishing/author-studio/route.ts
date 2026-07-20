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
  images?: string[];
  formatted?: boolean;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Ett kapittel kan ha flere bilder. Nye bilder ligger i `images[]`, men eldre
 * kapitler har kun `image_url` — normaliser til én liste uten duplikater.
 */
function chapterImages(chapter: Record<string, any>): string[] {
  const list = Array.isArray(chapter?.images) ? chapter.images : [];
  const legacy = chapter?.image_url ? [String(chapter.image_url)] : [];
  const seen = new Set<string>();
  return [...list, ...legacy]
    .map((u) => String(u || "").trim())
    .filter((u) => u && !seen.has(u) && (seen.add(u), true));
}

/**
 * Laster opp et opplastet bilde (data-URL) til content-images-bøtta og
 * returnerer den offentlige URL-en. Brukes når forfatteren laster opp egne
 * bilder til et kapittel.
 */
async function uploadDataUrl(dataUrl: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 12 * 1024 * 1024) throw new Error("Bildet er for stort (maks 12 MB).");
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : mimeType.includes("gif") ? "gif" : "png";
  const storagePath = `forfatter/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("content-images").upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) {
    console.error("[Forfatter] Bildeopplasting feilet:", error);
    return null;
  }
  return supabase.storage.from("content-images").getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Reparerer et AVKUTTET JSON-svar (typisk når modellen når token-taket midt i
 * en lang liste): kutter til siste fullstendige element, dropper etterhengende
 * komma og lukker åpne klammer. Berger dermed f.eks. en kapitteloversikt der
 * bare det siste kapittelet ble kappet, i stedet for å forkaste alt.
 */
function repairTruncatedJson(raw: string): unknown {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const s = raw.slice(start).replace(/```\s*$/i, "").trim();
  let inStr = false;
  let esc = false;
  let lastSafe = -1; // indeks (eksklusiv) frem til en trygg avslutningsposisjon
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') { inStr = false; lastSafe = i + 1; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "}" || ch === "]" || ch === ",") lastSafe = i + 1;
  }
  if (lastSafe < 0) return null;
  let cut = s.slice(0, lastSafe).replace(/,\s*$/, "");
  const closers: string[] = [];
  let inStr2 = false;
  let esc2 = false;
  for (let i = 0; i < cut.length; i += 1) {
    const ch = cut[i];
    if (inStr2) {
      if (esc2) esc2 = false;
      else if (ch === "\\") esc2 = true;
      else if (ch === '"') inStr2 = false;
      continue;
    }
    if (ch === '"') inStr2 = true;
    else if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") closers.pop();
  }
  while (closers.length) cut += closers.pop();
  try {
    return JSON.parse(cut);
  } catch {
    return null;
  }
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
        // ignorer — prøv reparasjon under
      }
    }
    const repaired = repairTruncatedJson(value);
    return repaired !== null ? (repaired as T) : fallback;
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

  // Finn hvilket overskriftsnivå som markerer KAPITLER. Et manus bruker typisk
  // Overskrift 1 til kapitler og Overskrift 2/3 til underavsnitt inne i
  // kapittelet. Splitter vi på alle nivåer, blir hvert underavsnitt et eget
  // «kapittel» (en bok med 33 kapitler ble til 264). Vi bruker derfor det
  // ØVERSTE nivået som forekommer minst to ganger, og lar dypere overskrifter
  // bli stående som en del av kapittelteksten.
  const countLevel = (n: number) => (text.match(new RegExp(`^#{${n}}[ \\t]+\\S.*$`, "gm")) || []).length;
  let chapterLevel = 0;
  for (const n of [1, 2, 3]) {
    if (countLevel(n) >= 2) {
      chapterLevel = n;
      break;
    }
  }

  const matches = chapterLevel > 0
    ? [...text.matchAll(new RegExp(`^#{${chapterLevel}}[ \\t]+.+$`, "gm"))]
    // Ingen markdown-overskrifter (typisk PDF-uttrekk): se etter linjer som
    // «Kapittel 3 – …» / «Chapter 3: …».
    : [...text.matchAll(/^(?:kapittel|chapter|del|part)\s+\d+.{0,80}$/gim)];

  if (matches.length >= 2) {
    const sections: Chapter[] = [];
    for (let i = 0; i < matches.length; i += 1) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
      const heading = matches[i][0].replace(/^#{1,6}[ \t]+/, "").trim();
      const body = text.slice(start + matches[i][0].length, end).trim();
      sections.push({ chapter_title: heading, draft: body });
    }
    const preamble = text.slice(0, matches[0].index ?? 0).trim();
    if (preamble) sections.unshift({ chapter_title: "Innledning", draft: preamble });

    // Overskrifter uten egen brødtekst — boktittelen og «PART I»-skillere —
    // skal ikke bli tomme kapitler. De henges på kapittelet under, så
    // strukturen beholdes uten å blåse opp kapittellisten.
    const chapters: Chapter[] = [];
    let carry = "";
    for (const s of sections) {
      if (wordCount(s.draft) < 40) {
        carry += `${carry ? "\n\n" : ""}## ${s.chapter_title}${s.draft ? `\n\n${s.draft}` : ""}`;
        continue;
      }
      chapters.push(carry ? { ...s, draft: `${carry}\n\n${s.draft}` } : s);
      carry = "";
    }
    if (carry) {
      if (chapters.length > 0) chapters[chapters.length - 1].draft += `\n\n${carry}`;
      else chapters.push({ chapter_title: "Manuskript", draft: carry });
    }
    if (chapters.length >= 2) return chapters;
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
  // Del opp i vinduer og let etter kapittelgrenser i HELE manuset. Tidligere
  // så vi bare de første 90k tegnene, slik at en lang bok endte med en håndfull
  // kapitler og resten som ett gigantisk siste kapittel.
  const WINDOW = 80000;
  const MAX_WINDOWS = 6;
  const mechanical = (slice: string, label: (n: number) => string): Chapter[] => {
    const words = slice.split(/\s+/).filter(Boolean);
    const perPart = 2200;
    const parts: Chapter[] = [];
    for (let i = 0; i < words.length; i += perPart) {
      parts.push({ chapter_title: label(parts.length + 1), draft: words.slice(i, i + perPart).join(" ") });
    }
    return parts;
  };

  const found: Array<{ title: string; index: number }> = [];
  let cursor = 0;
  for (let w = 0; w < MAX_WINDOWS; w += 1) {
    const start = w * WINDOW;
    if (start >= text.length) break;
    const sample = text.slice(start, start + WINDOW);
    if (sample.trim().length < 500) break;
    try {
      const raw = await askClaude(
        `Du er en manusredaktør som skal finne kapittelgrensene i en DEL av et manus der formateringen har gått tapt. Returner KUN gyldig JSON.

For hvert kapittel/naturlige hovedavsnitt som starter i denne delen:
- "title": kort, beskrivende kapitteltittel
- "start_marker": de FØRSTE 30-60 tegnene av kapittelets første setning, KOPIERT HELT EKSAKT fra teksten under (samme tegnsetting og stor/liten bokstav — ingen omskriving)

Finn ALLE kapitlene som begynner i denne delen (typisk 3-15). Dette er del ${w + 1} av manuset — teksten kan starte midt i et kapittel, og da hopper du bare over den innledende biten.

Manusdel:
---
${sample}
---

JSON schema:
{ "chapters": [{ "title": "string", "start_marker": "string" }] }`,
        { model: "sonnet", maxTokens: 4000, temperature: 0.2 },
      );
      const parsed = safeJsonParse<{ chapters?: Array<{ title?: string; start_marker?: string }> }>(raw, {});
      const markers = asArray(parsed.chapters)
        .map((c) => ({ title: String(c?.title || "").trim(), marker: String(c?.start_marker || "").trim() }))
        .filter((c) => c.title && c.marker.length >= 10);
      for (const m of markers) {
        const idx = text.indexOf(m.marker, Math.max(cursor, start));
        if (idx >= 0) {
          found.push({ title: m.title, index: idx });
          cursor = idx + m.marker.length;
        }
      }
    } catch (error) {
      console.warn("[Author Studio] AI-kapitteldeling feilet i vindu", w, error);
      break;
    }
  }

  if (found.length >= 2) {
    const chapters: Chapter[] = [];
    if (found[0].index > 400) chapters.push({ chapter_title: "Innledning", draft: text.slice(0, found[0].index).trim() });
    for (let i = 0; i < found.length; i += 1) {
      const end = i + 1 < found.length ? found[i + 1].index : text.length;
      const body = text.slice(found[i].index, end).trim();
      if (!body) continue;
      // Sluttbiten kan være hele resten av boken hvis markørene tok slutt før
      // manuset gjorde det — del den mekanisk i stedet for ett kjempekapittel.
      if (i === found.length - 1 && body.split(/\s+/).filter(Boolean).length > 4500) {
        const parts = mechanical(body, (n) => (n === 1 ? found[i].title : `${found[i].title} (del ${n})`));
        chapters.push(...parts);
      } else {
        chapters.push({ chapter_title: found[i].title, draft: body });
      }
    }
    if (chapters.length >= 2) return chapters;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3500) return [{ chapter_title: "Manuskript", draft: text }];
  return mechanical(text, (n) => `Del ${n}`);
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
    "GJØR KAPITTELET BETYDELIG LENGRE. Utvid hvert eksisterende poeng: utdyp resonnementet, legg til konkrete eksempler og situasjoner leseren kjenner seg igjen i, gi bakgrunn og kontekst, forklar hvorfor det er viktig, og bind avsnittene sammen med rikere overganger. Å utdype, forklare og eksemplifisere rundt det som allerede står er IKKE å finne opp fakta — det er å utvikle materialet. Behold forfatterens stemme og alt eksisterende innhold, og bygg videre på det.",
  simplify:
    "Forenkle kapittelet: kortere setninger, tydeligere språk, lettere å lese. Behold alt meningsinnhold.",
  custom: "Følg instruksen fra forfatteren nøyaktig.",
};

/**
 * Kapitteltekst returneres som REN MARKDOWN, ikke JSON: lange kapitler
 * pakket i JSON sprenger svarrammen (escaping + ett stort strengfelt), og
 * da ble hele kapittelet forkastet. Denne parseren tåler alle varianter:
 * rent markdown-svar, kodeblokk-innpakning og gamle JSON-svar.
 */
function extractPlainDraft(raw: string): { draft: string; summary: string } {
  let text = String(raw || "").trim();
  // Fjern omsluttende kodeblokker.
  text = text.replace(/^```(?:markdown|md|json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  // Gammelt JSON-format.
  if (text.startsWith("{") && text.endsWith("}")) {
    const parsed = safeJsonParse<{ draft?: string; change_summary?: string }>(text, {});
    if (parsed.draft) return { draft: String(parsed.draft).trim(), summary: String(parsed.change_summary || "").trim() };
  }
  // Skrell av en ledende «SAMMENDRAG:»-linje (og evt. «---»-skille) — men
  // ALT det som er igjen er kapittelet. Slik kan aldri en lone summary-linje
  // bli hele kapittelet (det var 150-tegns-buggen).
  let summary = "";
  if (/^SAMMENDRAG:/i.test(text)) {
    const nl = text.indexOf("\n");
    summary = (nl >= 0 ? text.slice(0, nl) : text).replace(/^SAMMENDRAG:\s*/i, "").trim();
    text = (nl >= 0 ? text.slice(nl + 1) : "").trim().replace(/^-{3,}\s*\n?/, "").trim();
  }
  return { draft: text, summary };
}

// Ser teksten ut til å være kuttet midt i? (Lange kapitler traff før et
// token-tak og stoppet midt i en setning.) Ferdig prosa ender på setnings-
// tegn, anførsel eller listetegn — ikke midt i et ord.
function looksCut(t: string) {
  const s = String(t || "").trimEnd();
  if (s.length < 40) return false;
  return !/[.!?…»"”'’)\]:*_`-]$/.test(s);
}

// Fullfør en tekst som ble kuttet på slutten ved å be modellen fortsette
// sømløst der den stoppet, og skjøt sammen. Inntil to runder.
async function finishIfCut(text: string): Promise<string> {
  let out = String(text || "");
  for (let i = 0; i < 2 && looksCut(out); i += 1) {
    const cont = await askClaude(
      `Du fortsetter en tekst som ble avbrutt midt i. Skriv KUN fortsettelsen, sømløst der den slapp — ingen gjentakelse, ingen «SAMMENDRAG», ingen innledning, ingen kodeblokker. Fullfør naturlig.\n\nSlik slutter teksten så langt:\n---\n${out.slice(-1600)}\n---`,
      { model: "sonnet", maxTokens: 16000, anthropicOnly: true },
    );
    const tail = extractPlainDraft(cont).draft.trim();
    if (!tail) break;
    out = `${out.replace(/\s+$/, "")}${/\s$/.test(text) ? "" : " "}${tail}`;
  }
  return out;
}

async function runChapterEdit(
  project: Record<string, any>,
  chapter: Chapter,
  action: string,
  instruction: string,
) {
  const task = EDIT_ACTIONS[action] || EDIT_ACTIONS.improve;
  const craft = resolveCraft(project.genre);
  const voice = voiceForPrompt(project.metadata_plan?.voice_sample);
  const originalDraft = String(chapter.draft || "");
  const originalWords = wordCount(originalDraft);
  const isExpand = action === "expand";
  // «Løft» skal gjøre teksten BEDRE, aldri kortere. Både Utvid og Løft er
  // derfor «vokse aldri krymp»-handlinger — guarden avviser en kortere tekst
  // og beholder originalen i stedet.
  const isLift = action === "lift";
  const noShrink = isExpand || isLift;
  // «Utvid» skal vokse markant (mål ~2x, minst ~800 ord). Alt annet skal
  // beholde lengden. Guarden avviser aldri en LENGRE tekst — bare tap.
  const expandTarget = Math.max(originalWords * 2, 800);
  const minWords = noShrink ? originalWords : Math.round(originalWords * 0.9);
  const lengthBlock = isExpand
    ? `LENGDEKRAV (ufravikelig):
- Originalen er ${originalWords} ord. Ditt kapittel skal være BETYDELIG lengre — sikt mot ca. ${expandTarget} ord, og aldri under ${minWords}.
- Behold alt fra originalen og bygg videre. Ikke komprimer, ikke oppsummer.`
    : isLift
    ? `LENGDEKRAV (ufravikelig):
- Originalen er ${originalWords} ord. Et løft hever kvaliteten — det gjør ALDRI teksten kortere. Ditt ferdige kapittel skal være på MINST ${originalWords} ord.
- Behold alt innhold, alle poenger, eksempler, navn og fakta. Stram språket og løft kvaliteten uten å fjerne substans; utdyp der det styrker kapittelet.`
    : `LENGDEKRAV (ufravikelig):
- Originalkapittelet er ${originalWords} ord. Ditt ferdige kapittel skal være på MINST ${minWords} ord.
- Du skal ALDRI komprimere, kutte avsnitt, slå sammen seksjoner eller fjerne innhold — forbedre setning for setning, avsnitt for avsnitt.
- Alt innhold, alle poenger, eksempler, navn og fakta fra originalen skal finnes igjen i din versjon.`;

  const buildPrompt = (extraDemand: string) => `
Du er en prisbelønt forfatter og manusredaktør.

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Målgruppe: ${project.audience || "generell"} · Språk: ${project.language || "no"} (svar på samme språk som kapittelet) · Sjanger: ${craft.label}

Oppgave: ${task}
${instruction ? `Forfatterens instruks: ${instruction}` : ""}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}

${lengthBlock}
${extraDemand}

Viktige regler:
- ALDRI finn opp harde fakta, personer, hendelser, datoer eller sitater. (Å utdype, forklare og gi generelle eksempler rundt temaet er tillatt.)
- Behold markdown-struktur hvis kapittelet har det.
- Returner hele det ferdige kapittelet, ikke bare endringene.

Kapittel: "${chapter.chapter_title}"
---
${originalDraft.slice(0, 26000)}
---

FORMAT PÅ SVARET (viktig — ingen JSON, ingen kodeblokker):
Første linje: SAMMENDRAG: én setning om hva du gjorde.
Deretter en linje med kun: ---
Deretter HELE det ferdige kapittelet i ren markdown.
`;

  const attempt = async (extraDemand: string) => {
    // anthropicOnly: bokprosa MÅ komme fra Claude — faller vi tilbake til en
    // svakere modell, følger den ikke formatet og leverer kort/ødelagt tekst.
    // maxTokens høyt nok til at lange kapitler ikke kuttes; blir de likevel
    // kuttet, fullføres de av finishIfCut.
    const raw = await askClaude(buildPrompt(extraDemand), { model: "sonnet", maxTokens: 16000, temperature: isExpand ? 0.55 : 0.4, anthropicOnly: true });
    const parsed = extractPlainDraft(raw);
    return { ...parsed, draft: await finishIfCut(parsed.draft) };
  };

  let { draft, summary } = await attempt("");
  // For kort svar = utvidelsen/redigeringen mislyktes. Prøv strengere
  // (to ganger for utvid, som er mest utsatt), ellers avbryt uten å lagre.
  const floor = () => !draft || wordCount(draft) < (noShrink ? originalWords : originalWords * 0.7);
  const maxRetries = noShrink ? 2 : 1;
  for (let r = 0; r < maxRetries && floor(); r += 1) {
    const retry = await attempt(
      isExpand
        ? `- FORRIGE FORSØK BLE FOR KORT (${wordCount(draft || "")} ord) — du KOMPRIMERTE i stedet for å utvide. Skriv kapittelet på nytt og gjør det MYE lengre: utdyp hvert avsnitt, legg til flere eksempler, forklaringer og kontekst. Mål: ca. ${expandTarget} ord.`
        : isLift
        ? `- FORRIGE FORSØK BLE KORTERE ENN ORIGINALEN (${wordCount(draft || "")} av ${originalWords} ord). Et løft skal ALDRI korte ned. Skriv kapittelet på nytt, behold alt innhold og hev kvaliteten — svaret skal være minst ${originalWords} ord.`
        : `- FORRIGE FORSØK BLE FOR KORT (${wordCount(draft || "")} ord). Dette er uakseptabelt. Gå gjennom originalen avsnitt for avsnitt og behold ALT — svaret skal være minst ${minWords} ord.`,
    );
    if (retry.draft && wordCount(retry.draft) > wordCount(draft || "")) {
      draft = retry.draft;
      summary = retry.summary || summary;
    }
  }
  const newWords = wordCount(draft || "");
  // TOTALTAP: tomt/søppel eller under halvparten av originalen = en feil hos
  // AI-en, ikke en legitim redigering. IKKE lagre — behold originalen og si
  // tydelig ifra. (Dette er 150-tegns-ødeleggelsen.)
  if (!draft || newWords < 30 || (originalWords > 80 && newWords < originalWords * 0.5)) {
    throw new Error(
      `AI-en mistet mesteparten av teksten (${newWords} av ${originalWords} ord) — sannsynligvis en midlertidig feil. Originalen er trygg og UENDRET. Prøv igjen om litt.`,
    );
  }
  // Et løft skal aldri gi kortere tekst. Kom den kortere ut selv etter nye
  // forsøk, avvis den og behold originalen — heller det enn å barbere teksten.
  if (isLift && originalWords > 40 && newWords < originalWords) {
    throw new Error(
      `Løftet ga en kortere tekst (${newWords} av ${originalWords} ord), og et løft skal aldri korte ned. Originalen er UENDRET. Prøv igjen, eller bruk «Utvid» hvis du vil ha mer tekst.`,
    );
  }
  const expected = isExpand ? Math.max(originalWords, 1) : Math.round(originalWords * 0.85);
  const shrunk = newWords < expected;
  const warning = shrunk
    ? isExpand
      ? `Kapittelet ble ikke lengre (${newWords} av ${originalWords} ord) — det er tynt på innhold å bygge på. Vil du fylle det ut, skriv stikkord/detaljer i «Egendefinert endring». Trykk «Angre AI» for å beholde originalen.`
      : `Obs: kapittelet ble kortere (${newWords} av ${originalWords} ord). Trykk «Angre AI» hvis du vil ha den lengre originalen tilbake.`
    : "";
  return { draft, changeSummary: summary, warning, newWords, originalWords };
}

/**
 * Slår sammen den eksisterende kapittelversjonen med en ny versjon (typisk
 * fra en opplastet Word-fil der forfatteren har gjort endringer) til ÉN bedre
 * versjon. AI-en tar det beste fra begge: den nyere teksten vinner der de er
 * uenige, men ingenting av substans skal gå tapt. Aldri kortere enn den
 * lengste av de to. Kuttes svaret, fullføres det av finishIfCut.
 */
async function mergeChapterVersions(
  project: Record<string, any>,
  chapterTitle: string,
  oldDraft: string,
  newDraft: string,
): Promise<string> {
  const craft = resolveCraft(project.genre);
  const voice = voiceForPrompt(project.metadata_plan?.voice_sample);
  const floorWords = Math.max(wordCount(oldDraft), wordCount(newDraft));
  const prompt = `
Du er en prisbelønt forfatter og manusredaktør. Du skal SLÅ SAMMEN to versjoner av samme kapittel til én, klart bedre versjon.

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Språk: ${project.language || "no"} (svar på samme språk som kapittelet) · Sjanger: ${craft.label}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}

SLIK SLÅR DU SAMMEN:
- Den NYE versjonen er forfatterens seneste endringer og skal veie tyngst der de to er uenige.
- Behold ALT av substans fra BEGGE versjoner: poenger, eksempler, navn, fakta, formuleringer som er bedre i den gamle.
- Ikke bare lim sammen — vev det til én sammenhengende, gjennomarbeidet tekst med god flyt.
- Fjern ekte gjentakelser, men aldri unikt innhold. Resultatet skal være MINST ${floorWords} ord.
- ALDRI dikt opp nye harde fakta, personer, datoer eller sitater.

Kapittel: "${chapterTitle}"

=== GAMMEL VERSJON ===
${String(oldDraft || "").slice(0, 24000)}

=== NY VERSJON (forfatterens endringer) ===
${String(newDraft || "").slice(0, 24000)}

FORMAT PÅ SVARET (viktig — ingen JSON, ingen kodeblokker):
Første linje: SAMMENDRAG: én setning om hva du slo sammen.
Deretter en linje med kun: ---
Deretter HELE det sammenslåtte kapittelet i ren markdown.
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 16000, temperature: 0.4, anthropicOnly: true });
  const merged = await finishIfCut(extractPlainDraft(raw).draft);
  if (!merged || wordCount(merged) < 30) {
    throw new Error("Sammenslåingen mislyktes (tomt svar). Kapittelet er UENDRET. Prøv igjen om litt.");
  }
  return merged;
}

/**
 * Vever LØS ny informasjon (notater, oppdateringer, fakta som «passer litt
 * her og der») inn i ET kapittel — på rett sted, og forbedrer teksten rundt
 * så det flyter. Legger til, fjerner aldri. Kun den delen av infoen som hører
 * til dette kapittelet brukes; resten ignoreres. Aldri kortere enn originalen.
 */
async function weaveInInfo(
  project: Record<string, any>,
  chapterTitle: string,
  oldDraft: string,
  info: string,
): Promise<string> {
  const craft = resolveCraft(project.genre);
  const voice = voiceForPrompt(project.metadata_plan?.voice_sample);
  const originalWords = wordCount(oldDraft);
  const prompt = `
Du er en prisbelønt forfatter og manusredaktør. Du får ETT eksisterende kapittel og et stykke NY INFORMASJON (løse notater, oppdateringer eller fakta forfatteren har lagt til).

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Språk: ${project.language || "no"} (svar på samme språk som kapittelet) · Sjanger: ${craft.label}
${voice}
HÅNDVERKSREGLER (${craft.label}):
${craft.writing_rules}

DIN OPPGAVE:
- Vev den nye informasjonen inn i kapittelet DER den naturlig hører hjemme — i rett avsnitt, på rett sted — og forbedre teksten rundt så overgangene flyter.
- Bruk KUN den delen av informasjonen som passer til nettopp dette kapittelet. Ignorer det som tydelig hører til et annet tema/kapittel.
- Behold ALT eksisterende innhold. Du legger til og forbedrer — du fjerner ingenting.
- ALDRI dikt opp harde fakta utover det som står i notatene.
- Resultatet skal være MINST ${originalWords} ord (originalens lengde), gjerne litt lengre.

KAPITTEL: "${chapterTitle}"
---
${String(oldDraft || "").slice(0, 24000)}
---

NY INFORMASJON Å VEVE INN:
---
${String(info || "").slice(0, 12000)}
---

FORMAT PÅ SVARET (viktig — ingen JSON, ingen kodeblokker):
Første linje: SAMMENDRAG: én setning om hva du vevet inn.
Deretter en linje med kun: ---
Deretter HELE det oppdaterte kapittelet i ren markdown.
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 16000, temperature: 0.4, anthropicOnly: true });
  const woven = await finishIfCut(extractPlainDraft(raw).draft);
  if (!woven || wordCount(woven) < 30) {
    throw new Error("Innfletting mislyktes (tomt svar). Kapittelet er UENDRET. Prøv igjen om litt.");
  }
  return woven;
}

/**
 * Lar AI velge hvilket eksisterende kapittel et stykke løs info passer best i.
 * Returnerer indeksen, eller -1 hvis ingenting passer.
 */
async function pickChapterForInfo(chapters: Chapter[], info: string): Promise<number> {
  if (chapters.length === 0) return -1;
  const list = chapters
    .map((c, i) => `${i}. ${c.chapter_title} — ${String(c.draft || "").slice(0, 220).replace(/\s+/g, " ")}`)
    .join("\n");
  const raw = await askClaude(
    `Du får en kapittelliste og et stykke ny informasjon. Hvilket kapittel hører informasjonen best hjemme i? Returner KUN gyldig JSON.

KAPITLER:
${list.slice(0, 12000)}

NY INFORMASJON:
---
${String(info || "").slice(0, 4000)}
---

JSON schema: { "index": 0 }  (bruk kapittelnummeret foran tittelen; -1 hvis ingen passer)`,
    { model: "haiku", maxTokens: 200, temperature: 0.1 },
  );
  const parsed = safeJsonParse<{ index?: number }>(raw, {});
  const idx = Number(parsed.index);
  return Number.isInteger(idx) && idx >= 0 && idx < chapters.length ? idx : -1;
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
Du er en profesjonell litterær oversetter.

Oversett kapittelet under til ${targetLanguage}. Behold tone, stemme, struktur og
markdown. Oversett idiomatisk — ikke ord for ord. ALDRI legg til eller fjern innhold.

Bok: "${bookTitle}"
Kapittel: "${chapter.chapter_title}"
---
${String(chapter.draft || "").slice(0, 22000)}
---

FORMAT PÅ SVARET (viktig — ingen JSON, ingen kodeblokker):
Første linje: SAMMENDRAG: den oversatte kapitteltittelen.
Deretter en linje med kun: ---
Deretter HELE kapittelet oversatt, i ren markdown.
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 8000, temperature: 0.3 });
  const { draft, summary } = extractPlainDraft(raw);
  if (!draft || draft.length < 100) throw new Error(`Oversettelsen av "${chapter.chapter_title}" feilet.`);
  return {
    chapter_title: (summary || chapter.chapter_title).trim(),
    draft,
  };
}

async function formatChapter(chapter: Chapter, language: string) {
  const originalDraft = String(chapter.draft || "");
  const originalWords = wordCount(originalDraft);
  const prompt = `
Du er en bokdesigner og typograf.

Formater kapittelet til ren, profesjonell markdown: tydelige mellomtitler (##/###)
der det er naturlig, avsnitt på 2-5 setninger, punktlister der innholdet er
oppramsing, og uthevinger med måte.

ABSOLUTT KRAV: IKKE endre, kutt, forkort eller omskriv ordlyden. Behold HVER setning
og HVERT ord — kun formateringen (avsnitt, overskrifter, lister) skal endres.
Original er ${originalWords} ord; svaret skal ha samme antall ord (±5 %).

Kapittel: "${chapter.chapter_title}"
---
${originalDraft.slice(0, 24000)}
---

Returner KUN hele det formaterte kapittelet i ren markdown — ingen JSON, ingen innledning, ingen kodeblokker.
`;
  const raw = await askClaude(prompt, { model: "haiku", maxTokens: 8000, temperature: 0.2 });
  const { draft } = extractPlainDraft(raw);
  if (!draft || draft.length < 100) throw new Error(`Formateringen av "${chapter.chapter_title}" feilet.`);
  // Formatering skal aldri miste innhold — mister den mer enn 10 %, behold originalen.
  if (wordCount(draft) < originalWords * 0.9) return originalDraft;
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
      images: chapters.filter((c) => chapterImages(c).length > 0).length,
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

    // Universell inngang: opprett et prosjekt i Forfatterstudio fra hvor som
    // helst i appen (Content Hub, oppgaver, Victoria-forslag). Tar en tittel,
    // valgfritt kildeinnhold (blir kapitler/seksjoner), en brief og en
    // dokumenttype. Returnerer prosjektet så kalleren kan dyplenke inn i
    // studioet på /publishing/forfatterstudio?project=<id>.
    if (mode === "create_project") {
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Tittel mangler." }, { status: 400 });
      const docType = String(body.doc_type || "book").toLowerCase();
      // Dokumenttype → sjanger (håndverksregler). Presentasjon/analyse/artikkel
      // bruker sakprosa-reglene inntil egne formater bygges.
      const genreByType: Record<string, string> = {
        book: "guide",
        analyse: "guide",
        analysis: "guide",
        presentation: "guide",
        presentasjon: "guide",
        article: "guide",
        artikkel: "guide",
        children: "children",
        memoir: "memoir",
        fiction: "fiction",
        self_development: "self_development",
      };
      const genre = String(body.genre || genreByType[docType] || "guide");
      const sourceText = String(body.source_text || "").trim();

      let chapters: Chapter[] = [];
      if (sourceText) {
        chapters = splitManuscript(sourceText);
        if (chapters.length === 1 && sourceText.length > 6000) chapters = await aiSplitChapters(sourceText);
      }

      const { data: project, error } = await supabase
        .from("publishing_book_projects")
        .insert({
          brand_id: "freddypublishing",
          title,
          subtitle: String(body.subtitle || "").trim(),
          language: String(body.language || "no"),
          genre,
          audience: String(body.audience || "").trim() || null,
          positioning: String(body.brief || "").trim() || null,
          status: chapters.length > 0 ? "ready_for_export" : "draft",
          metadata_plan: {
            doc_type: docType,
            created_from: String(body.source || "app"),
            source_material: sourceText ? sourceText.slice(0, 60000) : "",
            source_instructions: String(body.brief || "").trim(),
            created_at: new Date().toISOString(),
          },
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
      return NextResponse.json({
        success: true,
        mode,
        project,
        chapters: chapters.length,
        studio_url: `/publishing/forfatterstudio?project=${project.id}`,
      });
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
      if (String(chapter.draft || "").length > 26000) {
        return NextResponse.json(
          { error: "Kapittelet er for langt til trygg AI-redigering (innhold ville gått tapt). Bruk «Del opp i kapitler» først, og rediger deretter kapittel for kapittel." },
          { status: 400 },
        );
      }

      // «Løft»: målrettet omskriving som retter redaktørens konkrete notater
      // fra kvalitetsvurderingen — og scorer kapittelet på nytt etterpå.
      const liftNotes = asArray<string>(chapter.quality?.notes).map(String).filter(Boolean);
      const liftTarget = Math.min(10, Math.max(8, Number(body.target || 8)));
      // Et tynt/kort kapittel scorer lavt NETTOPP fordi det mangler dybde —
      // da må løftet bygge det ut, ikke bare pusse på den korte teksten.
      // Sikt mot kapitteloversiktens mål, ellers en sunn standardlengde.
      const chapterWords = wordCount(String(chapter.draft || ""));
      const tocMatch = asArray<Record<string, any>>((project as any).outline_plan?.toc).find(
        (t) => normalizeTitleKey(t.title) === normalizeTitleKey(chapter.chapter_title),
      );
      const healthyTarget = Math.max(1200, Number(tocMatch?.target_words || 0) || 1500);
      const isThin = chapterWords < healthyTarget * 0.8;
      const lengthDirective = isThin
        ? `\nDETTE KAPITTELET ER FOR KORT (${chapterWords} ord) — det er hovedgrunnen til lav score. Bygg det ut til ca. ${healthyTarget} ord: utdyp hvert poeng, legg til konkrete eksempler, situasjoner og forklaringer som hører naturlig til temaet. IKKE finn opp fakta, men utvikle det som allerede står og gi leseren mer verdi. Overfladisk pynt på den korte teksten er IKKE godt nok.`
        : `\nBehold alt faktainnhold og omtrent samme lengde.`;
      const effectiveInstruction =
        action === "lift"
          ? `${
              liftTarget >= 10
                ? "Løft kapittelet til et feilfritt 10/10 — teksten skal tåle en streng forlagsredaktør uten én anmerkning: presist språk i hver setning, sterk åpning og avslutning, perfekt rytme, null fyll."
                : "Løft kapittelet til publiseringsnivå (mål: 8+/10)."
            } Rett SPESIFIKT disse punktene fra redaktøren:\n${
              liftNotes.length ? liftNotes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "- Stram språket, konkretiser abstraksjoner, styrk åpning og avslutning."
            }${lengthDirective}`
          : instruction;

      // For tynne kapitler skal løftet oppføre seg som «utvid» (vokse), ikke
      // som en lengdebevarende redigering.
      const editAction = action === "lift" ? (isThin ? "expand" : "custom") : action;
      const result = await runChapterEdit(project, chapter, editAction, effectiveInstruction);

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
        warning: result.warning || null,
        new_words: result.newWords,
        new_score: newQuality?.score ?? null,
        project: updated,
      });
    }

    // Nødbrems: angre siste AI-endring på ALLE kapitler som har en
    // tidligere versjon lagret — gjenoppretter boken etter et dårlig løft.
    if (mode === "revert_all_chapters") {
      let restored = 0;
      const reverted = chapters.map((c) => {
        if (c.previous_draft && String(c.previous_draft).trim()) {
          restored += 1;
          return { ...c, draft: c.previous_draft, previous_draft: undefined, quality: undefined, last_edit: undefined };
        }
        return c;
      });
      if (restored === 0) {
        return NextResponse.json({ error: "Ingen kapitler har en tidligere versjon å gå tilbake til." }, { status: 400 });
      }
      const updated = await saveChapters(supabase, projectId, reverted);
      return NextResponse.json({ success: true, mode, restored, project: updated });
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

    // Bygg kapitteloversikten (toc) på nytt fra gjeldende kapittelrekkefølge.
    const rebuildToc = (list: Chapter[]) =>
      list.map((c, i) => ({ chapter: i + 1, title: c.chapter_title, goal: "", target_words: wordCount(c.draft) }));

    // Slett ett kapittel.
    if (mode === "delete_chapter") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      chapters.splice(index, 1);
      const updated = await saveChapters(supabase, projectId, chapters, {
        outline_plan: { ...((project as any).outline_plan || {}), toc: rebuildToc(chapters) },
      });
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Flytt ett kapittel opp/ned (bytt plass med nabo).
    if (mode === "move_chapter") {
      const { index } = findChapter(chapters, String(body.chapter_title || ""));
      if (index < 0) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      const dir = String(body.direction || "");
      const target = dir === "up" ? index - 1 : dir === "down" ? index + 1 : -1;
      if (target < 0 || target >= chapters.length) {
        return NextResponse.json({ success: true, mode, project }); // allerede ytterst
      }
      [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
      const updated = await saveChapters(supabase, projectId, chapters, {
        outline_plan: { ...((project as any).outline_plan || {}), toc: rebuildToc(chapters) },
      });
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Les en opplastet fil (Word/PDF, allerede uttrukket til tekst) mot en
    // EKSISTERENDE bok: del den nye teksten i kapitler og foreslå hva som skal
    // skje med hvert — slå sammen (AI) med et eksisterende kapittel, erstatte
    // det, eller legge til som nytt. Ingen lagring; bare en plan brukeren kan
    // justere før den kjøres.
    if (mode === "plan_update_from_file") {
      const manuscript = String(body.manuscript || "").trim();
      if (!manuscript) return NextResponse.json({ error: "Last opp filen først." }, { status: 400 });
      let incoming = splitManuscript(manuscript);
      if (incoming.length === 1 && manuscript.length > 6000) incoming = await aiSplitChapters(manuscript);
      const plan = incoming.map((inc, i) => {
        const match = chapters.find((e) => normalizeTitleKey(e.chapter_title) === normalizeTitleKey(inc.chapter_title));
        return {
          incoming_index: i,
          title: inc.chapter_title,
          words: wordCount(inc.draft),
          preview: String(inc.draft || "").slice(0, 240),
          draft: inc.draft,
          matched_title: match ? match.chapter_title : null,
          action: match ? "merge" : "append",
        };
      });
      return NextResponse.json({
        success: true,
        mode,
        plan,
        existing: chapters.map((e) => ({ title: e.chapter_title, words: wordCount(e.draft) })),
      });
    }

    // Kjør oppdateringen fra en fil-plan. Erstatt/legg-til skjer umiddelbart;
    // AI-sammenslåing er tungt, så vi tar inntil 4 sammenslåinger per kall og
    // returnerer resten i `pending` slik at klienten kaller på nytt til køen er
    // tom (samme mønster som oversettelse/omskriving). Originaler beholdes som
    // previous_draft, så «Angre AI» virker.
    if (mode === "apply_update_from_file") {
      const items = asArray<Record<string, any>>(body.items);
      if (items.length === 0) return NextResponse.json({ error: "Ingen endringer å bruke." }, { status: 400 });
      const applied = { replaced: 0, merged: 0, added: 0, woven: 0 };
      const warnings: string[] = [];
      const pending: Record<string, any>[] = [];
      // Én tung AI-operasjon (merge/insert) per kall. Da returnerer hvert kall
      // raskt, klienten viser tydelig fremgang («N igjen»), og en lang bok
      // fryser aldri et enkelt kall mot funksjonens tidsgrense. Telles på
      // FORSØK (ikke suksess), så et mislykket kall ikke sluker hele køen.
      const AI_CAP = 1;
      let aiAttempts = 0;
      for (const item of items) {
        const action = String(item.action || "").toLowerCase();
        const incomingDraft = String(item.draft || "").trim();
        const title = String(item.title || "").trim() || "Nytt kapittel";
        if (action === "skip" || !incomingDraft) continue;
        if (action === "append") {
          chapters.push({ chapter_title: title, draft: incomingDraft });
          applied.added += 1;
          continue;
        }
        // «Sett inn info der den passer»: finn rett kapittel (valgt eller
        // AI-plukket) og vev den nye infoen inn der den hører hjemme.
        if (action === "insert") {
          if (aiAttempts >= AI_CAP) {
            pending.push(item);
            continue;
          }
          aiAttempts += 1;
          let target = findChapter(chapters, String(item.target_title || ""));
          if (!target.chapter) {
            const pickedIdx = await pickChapterForInfo(chapters, incomingDraft);
            if (pickedIdx >= 0) target = { index: pickedIdx, chapter: chapters[pickedIdx] };
          }
          if (!target.chapter) {
            chapters.push({ chapter_title: title, draft: incomingDraft });
            applied.added += 1;
            continue;
          }
          try {
            const woven = await weaveInInfo(project, target.chapter.chapter_title, String(target.chapter.draft || ""), incomingDraft);
            chapters[target.index] = { ...target.chapter, previous_draft: target.chapter.draft, draft: woven, formatted: false, quality: undefined };
            applied.woven += 1;
          } catch (e) {
            warnings.push(`«${target.chapter.chapter_title}»: ${e instanceof Error ? e.message : "innfletting feilet"}`);
          }
          continue;
        }
        const { index, chapter } = findChapter(chapters, String(item.target_title || ""));
        if (!chapter) {
          chapters.push({ chapter_title: title, draft: incomingDraft });
          applied.added += 1;
          continue;
        }
        if (action === "replace") {
          chapters[index] = { ...chapter, previous_draft: chapter.draft, draft: incomingDraft, formatted: false, quality: undefined };
          applied.replaced += 1;
        } else if (action === "merge") {
          if (aiAttempts >= AI_CAP) {
            pending.push(item);
            continue;
          }
          aiAttempts += 1;
          try {
            const merged = await mergeChapterVersions(project, chapter.chapter_title, String(chapter.draft || ""), incomingDraft);
            chapters[index] = { ...chapter, previous_draft: chapter.draft, draft: merged, formatted: false, quality: undefined };
            applied.merged += 1;
          } catch (e) {
            warnings.push(`«${chapter.chapter_title}»: ${e instanceof Error ? e.message : "sammenslåing feilet"}`);
          }
        }
      }
      const updated = await saveChapters(supabase, projectId, chapters, {
        outline_plan: { ...((project as any).outline_plan || {}), toc: rebuildToc(chapters) },
      });
      return NextResponse.json({ success: true, mode, project: updated, applied, warnings, pending, remaining: pending.length });
    }

    // Fordel ETT helt dokument med løs info ut over HELE boken automatisk:
    // AI ruter hver bit av informasjonen til kapittelet der den hører hjemme
    // (uten å duplisere). Returnerer ferdige «insert»-items som klienten
    // kjører gjennom apply_update_from_file — så forfatteren slipper å velge
    // kapittel manuelt for hver del.
    if (mode === "plan_distribute_info") {
      const manuscript = String(body.manuscript || "").trim();
      if (!manuscript) return NextResponse.json({ error: "Last opp filen først." }, { status: 400 });
      if (chapters.length === 0) return NextResponse.json({ error: "Boken har ingen kapitler å fordele info til." }, { status: 400 });
      const list = chapters
        .map((c, i) => `${i}. ${c.chapter_title} — ${String(c.draft || "").slice(0, 240).replace(/\s+/g, " ")}`)
        .join("\n");
      const raw = await askClaude(
        `Du får en bok (kapittelliste med utdrag) og et dokument med NY, LØS informasjon (notater, oppdateringer, fakta som passer litt her og der). Fordel informasjonen til kapitlene der den hører hjemme. Returner KUN gyldig JSON.

Regler:
- Del informasjonen i biter og send HVER bit til DET ENE kapittelet den passer best i. IKKE dupliser samme info til flere kapitler.
- Ta kun med kapitler som faktisk skal ha ny info.
- "info" skal inneholde den relevante delen av dokumentet, ordrett eller lett omskrevet — det som senere skal veves inn i kapittelet.
- Info som ikke passer i noe eksisterende kapittel: bruk index = -1 (blir et nytt tillegg til slutt).

KAPITLER:
${list.slice(0, 16000)}

NY INFORMASJON:
---
${manuscript.slice(0, 40000)}
---

JSON schema:
{ "assignments": [ { "index": 0, "info": "streng" } ] }`,
        { model: "sonnet", maxTokens: 8000, temperature: 0.3 },
      );
      const parsed = safeJsonParse<{ assignments?: Array<{ index?: number; info?: string }> }>(raw, {});
      const items = asArray(parsed.assignments)
        .map((a) => {
          const info = String(a.info || "").trim();
          if (!info) return null;
          const idx = Number(a.index);
          if (Number.isInteger(idx) && idx >= 0 && idx < chapters.length) {
            return { title: chapters[idx].chapter_title, target_title: chapters[idx].chapter_title, action: "insert", draft: info };
          }
          return { title: "Nytt tillegg", target_title: "", action: "append", draft: info };
        })
        .filter(Boolean) as Record<string, any>[];
      if (items.length === 0) {
        return NextResponse.json({ error: "Fant ingen tydelig plass for informasjonen. Prøv «Oppdater fra fil» og velg plassering selv." }, { status: 422 });
      }
      return NextResponse.json({ success: true, mode, items, count: items.length });
    }

    // «Hva mangler for 10?»: rådgivning i stedet for omskriving. Peker ut det
    // eneste-forfatteren-kan-tilføre (ekte historier, tall, eksempler, en
    // mening med kant) som ville løftet kapittelet til topps — med hvor i
    // kapittelet, hvorfor, og en ferdig instruks-mal å fylle ut.
    if (mode === "advise_to_ten") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      const craft = resolveCraft(project.genre);
      const raw = await askClaude(
        `Du er en av landets fremste forlagsredaktører. Kapittelet under er teknisk godt, men mangler det siste for en toppkarakter. Returner KUN gyldig JSON.

Din jobb: fortell forfatteren PRESIST hva DE selv må tilføre av EGET materiale for å løfte kapittelet til 10/10 — ting en AI ikke kan eller bør finne opp: personlige historier og opplevelser, konkrete tall fra virkeligheten, ekte eksempler/case, en tydelig mening med kant, en overraskende innsikt.

For hvert forslag:
- "type": en av "historie" | "tall" | "eksempel" | "mening" | "innsikt"
- "where": hvor i kapittelet det bør inn (f.eks. «i åpningen», «etter avsnittet om priser»)
- "need": hva slags input trengs, konkret og spesifikt for DETTE kapittelet
- "instruction_template": en ferdig instruks forfatteren kan lime inn i «Egendefinert endring» og fylle inn sitt eget, med [FYLL INN …]-plassholder

Sjanger: ${craft.label} · Bok: "${project.title}" · Målgruppe: ${project.audience || "generell"}

Kapittel «${chapter.chapter_title}»:
---
${String(chapter.draft || "").slice(0, 22000)}
---

Gi 3-5 forslag, det viktigste først. Returner også 1-2 setninger om hva som allerede er sterkt.

JSON schema:
{ "already_strong": "string", "suggestions": [{ "type": "string", "where": "string", "need": "string", "instruction_template": "string" }] }`,
        { model: "sonnet", maxTokens: 2500, temperature: 0.5, anthropicOnly: true },
      );
      const advice = safeJsonParse<{ already_strong?: string; suggestions?: Array<Record<string, string>> }>(raw, {
        already_strong: "",
        suggestions: [],
      });
      let suggestions = asArray<Record<string, string>>(advice.suggestions).filter((s) => s && (s.need || s.instruction_template));
      // Tomt svar (feilklasse: modellen ga ikke gyldig JSON) → ett retry.
      if (suggestions.length === 0) {
        const retryRaw = await askClaude(
          `Returner KUN gyldig, kompakt JSON. List 3-5 konkrete ting forfatteren selv kan tilføre for å løfte kapittelet «${chapter.chapter_title}» til 10/10 (personlige historier, tall, ekte eksempler, en mening med kant).\n\nKapittel:\n---\n${String(chapter.draft || "").slice(0, 16000)}\n---\n\nJSON: { "already_strong": "string", "suggestions": [{ "type": "string", "where": "string", "need": "string", "instruction_template": "string" }] }`,
          { model: "sonnet", maxTokens: 2000, temperature: 0.4, anthropicOnly: true },
        );
        const retry = safeJsonParse<{ already_strong?: string; suggestions?: Array<Record<string, string>> }>(retryRaw, { suggestions: [] });
        suggestions = asArray<Record<string, string>>(retry.suggestions).filter((s) => s && (s.need || s.instruction_template));
        if (!advice.already_strong && retry.already_strong) advice.already_strong = retry.already_strong;
      }
      if (suggestions.length === 0) {
        return NextResponse.json(
          { error: "Redaktøren fikk ikke laget konkrete forslag denne gangen — prøv igjen om litt." },
          { status: 502 },
        );
      }
      const toTen = {
        already_strong: String(advice.already_strong || ""),
        suggestions: suggestions.slice(0, 5),
        at: new Date().toISOString(),
      };
      chapters[index] = { ...chapter, to_ten: toTen };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({ success: true, mode, to_ten: toTen, project: updated });
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

Returner KOMPAKT JSON (ingen unødvendige linjeskift) og hold goal-feltene korte, så hele oversikten får plass.

JSON schema:
{
  "title": "string (behold med mindre instruksen ber om nytt)",
  "subtitle": "string",
  "toc": [{"chapter":1,"title":"string","goal":"string","target_words":1800,"source_chapter":"string|null"}]
}`,
        { model: "sonnet", maxTokens: 8000, temperature: 0.35 },
      );
      let plan = safeJsonParse<{ title?: string; subtitle?: string; toc?: Array<Record<string, any>> }>(planRaw, {});
      let toc = asArray<Record<string, any>>(plan.toc);
      // Nødplan: hvis modellen ikke ga en brukbar oversikt, speil de
      // eksisterende kapitlene 1:1 så omskrivingen alltid kan starte —
      // instruksen brukes uansett når hvert kapittel faktisk skrives om.
      if (toc.length === 0) {
        plan = { title: project.title, subtitle: project.subtitle };
        toc = chapters.map((c, i) => ({
          chapter: i + 1,
          title: c.chapter_title,
          goal: "",
          target_words: Math.max(800, wordCount(c.draft)),
          source_chapter: c.chapter_title,
        }));
      }

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

Returner KUN hele kapittelet i ren markdown — ingen JSON, ingen innledning, ingen kodeblokker.`
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

Returner KUN hele kapittelet i ren markdown — ingen JSON, ingen innledning, ingen kodeblokker.`;

      const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 8000, temperature: 0.5 });
      const draft = extractPlainDraft(raw).draft;
      if (!draft || draft.length < 200) return NextResponse.json({ error: `Kapittelet «${tocRow.title}» feilet — prøv igjen.` }, { status: 500 });

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
        { model: "sonnet", maxTokens: 5000, temperature: 0.3 },
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

Returner KUN hele kapittelet i ren markdown — ingen JSON, ingen innledning, ingen kodeblokker.`,
          { model: "sonnet", maxTokens: 8000, temperature: 0.4 },
        );
        const polished = extractPlainDraft(raw).draft;
        if (polished && polished.length >= 100) draft = polished;
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

    // Klargjør boken for Amazon KDP: generer salgs-metadata (beskrivelse,
    // 7 søkeord, kategorier, pris) og returner en sjekkliste. Selve
    // opplastingen gjør forfatteren på kdp.amazon.com — KDP har ingen
    // publiserings-API — men EPUB + denne metadataen er alt de trenger.
    if (mode === "kdp_package") {
      if (chapters.length === 0) return NextResponse.json({ error: "Boken har ingen kapitler ennå." }, { status: 400 });
      const totalWords = chapters.reduce((s, c) => s + wordCount(String(c.draft || "")), 0);
      const meta = (project.metadata_plan || {}) as Record<string, any>;
      const hasCover = !!(meta.cover_image_url || meta.image_plan?.cover?.image_url);
      const craft = resolveCraft(project.genre);
      const lang = String(project.language || "no");
      const sample = chapters
        .slice(0, 6)
        .map((c) => `## ${c.chapter_title}\n${String(c.draft || "").slice(0, 1500)}`)
        .join("\n\n");
      const kdpPrompt = `Du er ekspert på Amazon KDP-utgivelse og metadata som selger. Returner KUN gyldig JSON.

Bok: "${project.title}"${project.subtitle ? ` — ${project.subtitle}` : ""}
Språk: ${lang} · Sjanger: ${craft.label} · Målgruppe: ${project.audience || "generell"}
Lengde: ~${totalWords} ord fordelt på ${chapters.length} kapitler.

Utdrag fra boken:
---
${sample.slice(0, 12000)}
---

Lag KDP-metadata som maksimerer synlighet og salg. Beskrivelsen skrives på bokens språk (${lang}) som en selgende bokomtale med krok i første setning.

JSON schema (fyll alle felt):
{
  "description_html": "150-250 ord salgsomtale i enkel HTML (kun <p>, <b>, <br>). Krok først, deretter hva leseren får, så en avslutning som lokker til kjøp.",
  "subtitle_suggestion": "forslag til undertittel som styrker søkbarhet (kan ligne dagens)",
  "keywords": ["7 søkeord/fraser kjøpere FAKTISK søker etter i denne nisjen — ikke gjenta boktittelen"],
  "categories": ["3 forslag til KDP-kategoristier, f.eks. 'Books > Business & Money > Entrepreneurship'"],
  "bisac": ["2 BISAC-emner/koder"],
  "price_usd": 9.99,
  "price_local": { "currency": "NOK", "amount": 99 },
  "reading_age": "kort tekst eller tom streng"
}`;
      let parsed = safeJsonParse<Record<string, any>>(
        await askClaude(kdpPrompt, { model: "sonnet", maxTokens: 1600, temperature: 0.5 }),
        {},
      );
      if (!parsed || !parsed.description_html) {
        parsed = safeJsonParse<Record<string, any>>(
          await askClaude(`${kdpPrompt}\n\nDu MÅ returnere gyldig JSON med alle feltene fylt ut.`, { model: "sonnet", maxTokens: 1600, temperature: 0.4 }),
          {},
        );
      }
      const kdpData = {
        description_html: String(parsed.description_html || ""),
        subtitle_suggestion: String(parsed.subtitle_suggestion || project.subtitle || ""),
        keywords: asArray<string>(parsed.keywords).map(String).filter(Boolean).slice(0, 7),
        categories: asArray<string>(parsed.categories).map(String).filter(Boolean).slice(0, 3),
        bisac: asArray<string>(parsed.bisac).map(String).filter(Boolean).slice(0, 2),
        price_usd: Number(parsed.price_usd) || null,
        price_local: parsed.price_local && typeof parsed.price_local === "object" ? parsed.price_local : null,
        reading_age: String(parsed.reading_age || ""),
        generated_at: new Date().toISOString(),
      };
      if (!kdpData.description_html) {
        return NextResponse.json({ error: "Klarte ikke å lage KDP-metadata nå. Prøv igjen om litt." }, { status: 502 });
      }
      const updated = await saveChapters(supabase, projectId, chapters, {
        metadata_plan: { ...meta, kdp: kdpData },
      });
      return NextResponse.json({
        success: true,
        mode,
        project: updated,
        kdp: kdpData,
        checklist: {
          has_cover: hasCover,
          chapters: chapters.length,
          words: totalWords,
          title: String(project.title || ""),
          subtitle: String(project.subtitle || ""),
          author: String(meta.author || "Freddy Bremseth"),
          language: lang,
        },
      });
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
      chapters[index] = { ...chapter, image_url: null, images: imageUrl ? [imageUrl] : [] };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({ success: true, mode, project: updated });
    }

    // Legg til ett bilde i kapittelet (fra AI-generering eller opplasting).
    // Er image_url en data-URL, lastes den opp til storage først.
    if (mode === "add_chapter_image") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      let imageUrl = String(body.image_url || "").trim();
      if (!imageUrl) return NextResponse.json({ error: "Mangler bilde." }, { status: 400 });
      if (imageUrl.startsWith("data:")) {
        try {
          const uploaded = await uploadDataUrl(imageUrl);
          if (!uploaded) return NextResponse.json({ error: "Kunne ikke lagre bildet." }, { status: 500 });
          imageUrl = uploaded;
        } catch (e) {
          return NextResponse.json({ error: e instanceof Error ? e.message : "Kunne ikke lagre bildet." }, { status: 400 });
        }
      }
      const nextImages = [...chapterImages(chapter), imageUrl].filter((u, i, a) => a.indexOf(u) === i);
      chapters[index] = { ...chapter, image_url: null, images: nextImages };
      const updated = await saveChapters(supabase, projectId, chapters);
      return NextResponse.json({ success: true, mode, image_url: imageUrl, project: updated });
    }

    // Fjern ett bilde fra kapittelet (etter URL).
    if (mode === "remove_chapter_image") {
      const { index, chapter } = findChapter(chapters, String(body.chapter_title || ""));
      if (!chapter) return NextResponse.json({ error: "Fant ikke kapittelet." }, { status: 404 });
      const target = String(body.image_url || "").trim();
      const nextImages = chapterImages(chapter).filter((u) => u !== target);
      chapters[index] = { ...chapter, image_url: null, images: nextImages };
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
