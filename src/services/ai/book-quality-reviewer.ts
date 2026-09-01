import { askBookAuthor } from "@/services/ai/book-author-client";

export const AI_QUALITY_CHECKS = ["canon_consistency", "editorial", "factual", "citations"] as const;
export type AiQualityCheckType = typeof AI_QUALITY_CHECKS[number];

export type QualityFinding = {
  severity: "critical" | "major" | "minor";
  location: string;
  issue: string;
  evidence: string;
  recommendation: string;
};

export type QualityReview = {
  result: "pass" | "warning" | "fail";
  score: number;
  summary: string;
  findings: QualityFinding[];
  webSources: Array<{ title: string; url: string }>;
  coverage: { inputChars: number; totalChars: number; truncated: boolean };
};

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    result: { type: "string", enum: ["pass", "warning", "fail"] },
    score: { type: "number" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["critical", "major", "minor"] },
          location: { type: "string" },
          issue: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["severity", "location", "issue", "evidence", "recommendation"],
      },
    },
  },
  required: ["result", "score", "summary", "findings"],
};

const instructions: Record<AiQualityCheckType, string> = {
  canon_consistency: "Kontroller manus mot godkjent seriebibel og work canon. Rapporter konkrete kontinuitetsbrudd, navne-/tidslinjefeil, løftebrudd og opplysninger som ikke finnes i canon.",
  editorial: "Vurder struktur, lesbarhet, repetisjon, tempo, kapittelåpninger, overforklaring, presisjon og profesjonell bokkvalitet. Ikke omskriv manus; gi lokaliserte funn.",
  factual: "Identifiser etterprøvbare faktapåstander og kontroller de viktigste med pålitelige kilder. Skill dokumentert feil, usikkerhet og påstander som trenger bedre belegg.",
  citations: "Kontroller at kildehenvisninger og bibliografiske påstander er sporbare, relevante og ikke oppdiktet. Bruk webkilder til å verifisere de viktigste referansene.",
};

export function manuscriptForReview(chapters: Array<Record<string, any>>, maxChars = 100_000) {
  const full = chapters.map((chapter, index) => `## ${String(chapter.chapter_title || chapter.title || `Chapter ${index + 1}`)}\n${String(chapter.draft || "").trim()}`).join("\n\n");
  return { text: full.slice(0, maxChars), totalChars: full.length, truncated: full.length > maxChars };
}

export function buildQualityPrompt(input: { type: AiQualityCheckType; title: string; manuscript: string; canon: unknown; coverage: { totalChars: number; truncated: boolean } }) {
  return `QUALITY GATE: ${input.type}\nBOOK: ${input.title}\n\nTASK:\n${instructions[input.type]}\n\nRULES:\n- Vurder kun materialet du faktisk har mottatt.\n- Ikke godkjenn boken; returner evidens til menneskelig beslutning.\n- Bruk result=fail ved kritiske eller flere store feil, warning ved avgrensede forbedringsbehov, ellers pass.\n- Score skal være 0–100.\n- Lokaliser hvert funn til kapittel/avsnitt når mulig.\n- Manusdekning: ${input.coverage.truncated ? `utdrag av ${input.coverage.totalChars} tegn` : `${input.coverage.totalChars} tegn, komplett`}.\n\nAPPROVED BIBLE/CANON:\n${JSON.stringify(input.canon).slice(0, 30_000)}\n\nMANUSCRIPT:\n${input.manuscript}`;
}

export async function reviewBookQuality(input: { type: AiQualityCheckType; title: string; chapters: Array<Record<string, any>>; canon: unknown }) {
  const manuscript = manuscriptForReview(input.chapters);
  if (!manuscript.text.trim()) throw new Error("Manusrevisjonen inneholder ingen kapitteltekst.");
  const webSources: Array<{ title: string; url: string }> = [];
  const raw = await askBookAuthor(buildQualityPrompt({ type: input.type, title: input.title, manuscript: manuscript.text, canon: input.canon, coverage: manuscript }), {
    requireOpenAI: true,
    webSearch: input.type === "factual" || input.type === "citations",
    responseMimeType: "application/json",
    responseSchema: REVIEW_SCHEMA,
    maxTokens: 5000,
    onWebSources: (sources) => webSources.push(...sources),
  });
  const parsed = JSON.parse(raw) as Omit<QualityReview, "webSources" | "coverage">;
  return {
    ...parsed,
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 50) : [],
    webSources,
    coverage: { inputChars: manuscript.text.length, totalChars: manuscript.totalChars, truncated: manuscript.truncated },
  } satisfies QualityReview;
}
