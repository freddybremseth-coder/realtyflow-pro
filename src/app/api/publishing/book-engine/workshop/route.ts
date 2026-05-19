import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/services/ai/claude-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    const cleaned = value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const mode = String(body.mode || "discover");
  const theme = String(body.theme || "").trim();
  if (!theme) return NextResponse.json({ error: "theme is required" }, { status: 400 });

  if (mode === "discover") {
    const prompt = `
Du er en erfaren bokcoach og markedstenker. Returner KUN gyldig JSON.

Brukerens tema:
${theme}

Lag:
1) 5 mulige bokretninger med kommersielt potensial
2) 8 presise avklaringsspørsmål som hjelper å velge riktig retning
3) forslag til hva boken kan oppnå for leseren

JSON schema:
{
  "directions": [
    {"id":"d1","title":"string","audience":"string","promise":"string","commercial_potential":"high|medium|low","notes":"string"}
  ],
  "questions": ["string"],
  "goals": ["string"]
}
`;
    const raw = await askClaude(prompt, { model: "sonnet", maxTokens: 2200, temperature: 0.55 });
    return NextResponse.json(
      safeJsonParse(raw, { directions: [], questions: [], goals: [] }),
    );
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
