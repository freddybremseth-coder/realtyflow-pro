import { askClaude } from "@/services/ai/claude-client";
import {
  buildPropertyEditorialFallback,
  parsePropertyEditorialAiResponse,
  propertyEditorialSource,
  PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT,
  type PropertyEditorialNo,
} from "@/lib/realty/property-editorial-no";

export type PropertyEditorialFallbackReason =
  | "no_ai_provider"
  | "provider_chain_unavailable"
  | "invalid_output";

export interface DiagnosedPropertyEditorialResult {
  editorial: PropertyEditorialNo;
  usedFallback: boolean;
  fallbackReason?: PropertyEditorialFallbackReason;
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
      return { editorial: fallback, usedFallback: true, fallbackReason: "invalid_output" };
    }

    return {
      editorial: {
        ...parsed,
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
