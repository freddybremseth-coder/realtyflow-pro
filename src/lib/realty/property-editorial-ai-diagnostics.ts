import { askClaude } from "@/services/ai/claude-client";
import {
  buildPropertyEditorialFallback,
  buildPropertyEditorialSeo,
  parsePropertyEditorialAiResponse,
  propertyEditorialSource,
  PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT,
  type PropertyEditorialNo,
} from "@/lib/realty/property-editorial-no";

export type PropertyEditorialFallbackReason =
  | "no_ai_provider"
  | "provider_chain_unavailable"
  | "invalid_output";

export interface PropertyEditorialOutputDiagnostics {
  length: number;
  empty: boolean;
  fenced: boolean;
  json_parseable: boolean;
  value_type: "empty" | "object" | "array" | "string" | "number" | "boolean" | "null" | "text";
  top_level_keys: string[];
  expected_fields: {
    headline_no: boolean;
    intro_no: boolean;
    bullets_no: boolean;
    orientation_no: boolean;
  };
}

export interface DiagnosedPropertyEditorialResult {
  editorial: PropertyEditorialNo;
  usedFallback: boolean;
  fallbackReason?: PropertyEditorialFallbackReason;
  outputDiagnostics?: PropertyEditorialOutputDiagnostics;
}

const PUBLIC_PLACEHOLDER = /\b(?:ukjent|ikke angitt|ikke spesifisert|ikke oppgitt|mangler)\b/i;
const PUBLIC_PROMOTIONAL = /\b(?:drømmebolig|fantastisk|unik|eksklusiv|spektakulær|perfekt|førsteklasses|attraktiv(?:t|e)?|mest populære|svært populær|fredelig)\b/i;

type ParsedEditorial = NonNullable<ReturnType<typeof parsePropertyEditorialAiResponse>>;

export function isPropertyEditorialPublicCopySafe(editorial: ParsedEditorial): boolean {
  const publicText = [editorial.headline_no, editorial.intro_no, ...editorial.bullets_no]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return Boolean(publicText) && !PUBLIC_PLACEHOLDER.test(publicText) && !PUBLIC_PROMOTIONAL.test(publicText);
}

function buildUserPrompt(property: Record<string, unknown>) {
  const source = propertyEditorialSource(property);
  return `Boligtype: ${source.type}          Soverom: ${source.beds ?? "Ikke angitt"}     Bad: ${source.baths ?? "Ikke angitt"}
Område/by: ${source.area}          Oppgitt areal: ${source.m2 ?? "Ikke angitt"} m² Etasje/plan: ${source.floor}
Fasiliteter: ${source.features.length > 0 ? source.features.join(", ") : "Ikke angitt"}    Energiklasse: ${source.epc}  Pris: ${source.price ? `€${source.price}` : "Ikke angitt"}
Solretning/himmelretning (kilde): ${source.facing || "Ikke angitt"}
Aktuell bruk (kilde): ${source.usage || "Ikke angitt"}
Beskrivelse (kilde): ${source.rawDescription || "Ikke angitt"}
Viktig for publisert tekst: Utelat fakta som mangler. Ikke skriv plassholderfraser som "Ikke angitt", "ukjent", "ikke spesifisert", "ikke oppgitt" eller "mangler" i headline_no, intro_no eller bullets_no. Unngå reklameord som "førsteklasses", "attraktiv", "mest populære", "svært populær" og "fredelig".`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline_no: { type: "string" },
    intro_no: { type: "string" },
    bullets_no: { type: "array", items: { type: "string" } },
    orientation_no: { type: "string" },
  },
  required: ["headline_no", "intro_no", "bullets_no", "orientation_no"],
  additionalProperties: false,
};

function classifyValue(value: unknown): PropertyEditorialOutputDiagnostics["value_type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function summarizeInvalidPropertyEditorialOutput(text: string): PropertyEditorialOutputDiagnostics {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*/i.test(trimmed);
  const candidate = stripJsonFence(text);

  let parsed: unknown = undefined;
  let jsonParseable = false;
  try {
    parsed = JSON.parse(candidate) as unknown;
    jsonParseable = true;
    if (typeof parsed === "string") {
      const nested = parsed.trim();
      try {
        parsed = JSON.parse(nested) as unknown;
      } catch {
        // Keep the decoded string. We deliberately do not persist its contents.
      }
    }
  } catch {
    // Structure metadata only; raw text is never persisted.
  }

  const object = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const topLevelKeys = object ? Object.keys(object).sort().slice(0, 24) : [];

  return {
    length: text.length,
    empty: trimmed.length === 0,
    fenced,
    json_parseable: jsonParseable,
    value_type: trimmed.length === 0 ? "empty" : jsonParseable ? classifyValue(parsed) : "text",
    top_level_keys: topLevelKeys,
    expected_fields: {
      headline_no: Boolean(object && Object.prototype.hasOwnProperty.call(object, "headline_no")),
      intro_no: Boolean(object && Object.prototype.hasOwnProperty.call(object, "intro_no")),
      bullets_no: Boolean(object && Object.prototype.hasOwnProperty.call(object, "bullets_no")),
      orientation_no: Boolean(object && Object.prototype.hasOwnProperty.call(object, "orientation_no")),
    },
  };
}

/**
 * Some providers have returned otherwise valid property editorial JSON while
 * omitting only intro_no. In that exact case we repair the response with the
 * deterministic, property-derived fallback intro. This does not add any new
 * AI facts: the replacement intro is generated solely from trusted property
 * fields by buildPropertyEditorialFallback().
 */
export function parsePropertyEditorialAiResponseWithFallbackIntro(
  text: string,
  fallbackIntro: string,
): ReturnType<typeof parsePropertyEditorialAiResponse> {
  const direct = parsePropertyEditorialAiResponse(text);
  if (direct) return direct;

  try {
    let parsed = JSON.parse(stripJsonFence(text)) as unknown;
    if (typeof parsed === "string") parsed = JSON.parse(parsed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const object = parsed as Record<string, unknown>;
    const hasHeadline = typeof object.headline_no === "string" && object.headline_no.trim().length > 0;
    const missingIntro = !(typeof object.intro_no === "string" && object.intro_no.trim().length > 0);
    if (!hasHeadline || !missingIntro || !fallbackIntro.trim()) return null;

    return parsePropertyEditorialAiResponse(
      JSON.stringify({
        ...object,
        intro_no: fallbackIntro,
      }),
    );
  } catch {
    return null;
  }
}

export async function generatePropertyEditorialNoDiagnosed(
  property: Record<string, unknown>,
  options?: { now?: Date },
): Promise<DiagnosedPropertyEditorialResult> {
  const fallback = buildPropertyEditorialFallback(property, options?.now);
  const hasAiProvider = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
  );

  if (!hasAiProvider) {
    return { editorial: fallback, usedFallback: true, fallbackReason: "no_ai_provider" };
  }

  try {
    const raw = await askClaude(buildUserPrompt(property), {
      systemPrompt: PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT,
      model: "haiku",
      maxTokens: 650,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      validateResponse: (text) => {
        const candidate = parsePropertyEditorialAiResponseWithFallbackIntro(text, fallback.intro_no);
        return candidate !== null && isPropertyEditorialPublicCopySafe(candidate);
      },
      fallbackOnInvalidResponse: true,
    });

    const parsed = parsePropertyEditorialAiResponseWithFallbackIntro(raw, fallback.intro_no);
    if (!parsed || !isPropertyEditorialPublicCopySafe(parsed)) {
      return {
        editorial: fallback,
        usedFallback: true,
        fallbackReason: "invalid_output",
        outputDiagnostics: summarizeInvalidPropertyEditorialOutput(raw),
      };
    }

    return {
      editorial: {
        ...parsed,
        // SEO utledes deterministisk fra samme fakta (ikke eget AI-kall).
        ...buildPropertyEditorialSeo(propertyEditorialSource(property)),
        source_hash: fallback.source_hash,
        generated_at: (options?.now ?? new Date()).toISOString(),
        model: "realtyflow-ai-chain/haiku",
      },
      usedFallback: false,
    };
  } catch (error) {
    console.warn(
      "[property-editorial-ai-diagnostics] provider chain unavailable, using deterministic fallback:",
      error instanceof Error ? error.message : error,
    );
    return {
      editorial: fallback,
      usedFallback: true,
      fallbackReason: "provider_chain_unavailable",
    };
  }
}
