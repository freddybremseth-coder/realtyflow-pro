import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { askBookAuthor as askClaude } from "@/services/ai/book-author-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const FREDDY_KNOWLEDGE = [
  "eiendom og kundereiser på Costa Blanca",
  "salg, CRM, automatisering og entreprenørskap",
  "økonomi, investering og strukturelle maktsystemer",
  "Spania og middelhavsliv",
  "olivenolje, regenerativt landbruk, jord og vin",
  "helse, farskap, personlig utvikling og praktisk AI",
  "psykologisk thriller, geopolitikk og historie",
];

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    const cleaned = value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const mode = String(body.mode || "discover");
  const theme = String(body.theme || "").trim();
  if (!theme) return NextResponse.json({ error: "theme is required" }, { status: 400 });

  if (mode === "discover") {
    const genre = String(body.genre || "guide");
    const illustrationStyle = String(body.illustration_style || "");
    const discoverySource = String(body.discovery_source || "keywords");
    const seriesName = String(body.series_name || "");
    const knownSeries = Array.isArray(body.known_series) ? body.known_series.map(String).slice(0, 40) : [];
    const researchInstruction = discoverySource === "market"
      ? "Bruk live web research og undersøk aktuelle leser- og markedssignaler. Ikke påstå Amazon-salgstall uten verifiserbar kilde. Skill mellom observerte signaler og egen vurdering. Hver retning skal oppgi ekte kilder som faktisk ble brukt."
      : discoverySource === "author_knowledge"
        ? `Prioriter krysningspunkter med Freddy Bremseths dokumenterte kunnskap: ${FREDDY_KNOWLEDGE.join("; ")}. Ikke finn opp personlige erfaringer.`
        : "Bygg forslagene direkte fra stikkordene og valgt serie. Ikke legg til påståtte markedstall.";
    const prompt = `
Du er en erfaren bokcoach og markedstenker. Returner KUN gyldig JSON.

Brukerens tema:
${theme}

Kontekst:
${JSON.stringify({ genre, illustrationStyle, discoverySource, seriesName, knownSeries }, null, 2)}

Arbeidsmåte:
${researchInstruction}

Tilpass spørsmålene til valgt sjanger. Hvis genre=children, inkluder spørsmål som avklarer billedstil, alderstrinn, tone og konsistens for gjengangere.

Lag:
1) 5 tydelig forskjellige bokretninger med kommersielt potensial og konkret begrunnelse
2) 8 presise avklaringsspørsmål som hjelper å velge riktig retning
3) forslag til hva boken kan oppnå for leseren

JSON schema:
{
  "directions": [
    {"id":"d1","title":"string","audience":"string","promise":"string","commercial_potential":"high|medium|low","why_now":"string","why_freddy":"string","keywords":["string"],"notes":"string","sources":[{"title":"string","url":"https://..."}]}
  ],
  "questions": ["string"],
  "goals": ["string"],
  "research_summary":"string"
}
`;
    try {
      let researchSources: Array<{ title: string; url: string }> = [];
      const raw = await askClaude(prompt, {
        model: "sonnet",
        maxTokens: discoverySource === "market" ? 5000 : 2600,
        temperature: 0.45,
        webSearch: discoverySource === "market",
        requireOpenAI: discoverySource === "market",
        responseMimeType: "application/json",
        onWebSources: (sources) => { researchSources = sources; },
      });
      return NextResponse.json(
        {
          ...safeJsonParse(raw, { directions: [], questions: [], goals: [], research_summary: "" }),
          discovery_source: discoverySource,
          research_sources: researchSources.slice(0, 12),
        },
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Bokforslagene kunne ikke lages." },
        { status: 502 },
      );
    }
  }

  const selectedDirection = String(body.selected_direction || "");
  const genre = String(body.genre || "guide");
  const seriesName = String(body.series_name || "");
  const goals = Array.isArray(body.goals) ? body.goals.map(String) : [];
  const questionAnswers = Array.isArray(body.question_answers)
    ? body.question_answers
        .map((row: unknown) => ({
          question: String((row as any)?.question || "").trim(),
          answer: String((row as any)?.answer || "").trim(),
        }))
        .filter((row: { question: string; answer: string }) => row.question && row.answer)
    : [];
  const contentFocus = String(body.content_focus || "");
  const style = String(body.style || "practical");
  const lengthPages = Number(body.length_pages || 180);
  const language = String(body.language || "en");

  const prompt = `
Du er en bokstrateg og KDP-planlegger. Returner KUN gyldig JSON.

Input:
${JSON.stringify({ theme, selectedDirection, genre, seriesName, goals, questionAnswers, contentFocus, style, lengthPages, language }, null, 2)}

Lag en konkret bokplan klar for produksjon:
- tittel + undertittel
- målgruppe
- posisjonering
- foreslått lengde (ord + sider)
- seed keywords
- kapitteloversikt

Hvis genre er memoir/biografi:
- Ikke foreslå nye faktiske hendelser/personer som ikke kommer fra brukerens materiale.
- Prioriter språkforbedring, struktur og tydelig narrativ flyt.
- Merk usikker informasjon som "Må verifiseres".

JSON schema:
{
  "title":"string",
  "subtitle":"string",
  "audience":"string",
  "positioning":"string",
  "target_pages": 180,
  "target_words": 32000,
  "seed_keywords":["string"],
  "chapter_overview":[{"chapter":1,"title":"string","goal":"string"}]
}
`;
  const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2600, temperature: 0.45 });
  return NextResponse.json(
    safeJsonParse(raw, {
      title: "",
      subtitle: "",
      audience: "",
      positioning: "",
      target_pages: lengthPages,
      target_words: Math.max(12000, Math.round(lengthPages * 190)),
      seed_keywords: [],
      chapter_overview: [],
    }),
  );
}
