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

function buildUserPrompt(property: Record<string, unknown>) {
  const source = propertyEditorialSource(property);
  return `Boligtype: ${source.type}          Soverom: ${source.beds ?? "Ikke angitt"}     Bad: ${source.baths ?? "Ikke angitt"}
Område/by: ${source.area}          Oppgitt areal: ${source.m2 ?? "Ikke angitt"} m² Etasje/plan: ${source.floor}
Fasiliteter: ${source.features.length > 0 ? source.features.join(", ") : "Ikke angitt"}    Energiklasse: ${source.epc}  Pris: ${source.price ? `€${source.price}` : "Ikke angitt"}
Solretning/himmelretning (kilde): ${source.facing || "Ikke angitt"}
Aktuell bruk (kilde): ${source.usage || "Ikke angitt"}
Beskrivelse (kilde): ${source.rawDescription || "Ikke angitt"}`;
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

export function summarizeInvalidPropertyEditorialOutput(text: string): PropertyEditorialOutputDiagnostics {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*/i.test(trimmed);
  let candidate = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

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
      validateResponse: (text) => parsePropertyEditorialAiResponse(text) !== null,
      fallbackOnInvalidResponse: true,
    });

    const parsed = parsePropertyEditorialAiResponse(raw);
    if (!parsed) {
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
