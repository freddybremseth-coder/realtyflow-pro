import { askClaude } from "@/services/ai/claude-client";
import {
  buildPropertyEditorialFallback,
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

const FORBIDDEN_CLAIMS = /\b(drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt)\b/i;

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseEditorial(text: string): {
  headline_no: string;
  intro_no: string;
  bullets_no: string[];
  orientation_no: string;
} | null {
  try {
    const parsed = JSON.parse(stripJsonFence(text)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.headline_no !== "string" || !parsed.headline_no.trim()) return null;
    if (typeof parsed.intro_no !== "string" || !parsed.intro_no.trim()) return null;
    if (!Array.isArray(parsed.bullets_no) || !parsed.bullets_no.every((item) => typeof item === "string")) return null;
    if (typeof parsed.orientation_no !== "string" || !parsed.orientation_no.trim()) return null;

    const bullets = Array.from(
      new Set(parsed.bullets_no.map((item) => String(item).trim()).filter(Boolean)),
    ).slice(0, 6);
    const combined = [parsed.headline_no, parsed.intro_no, ...bullets, parsed.orientation_no].join(" ");
    if (FORBIDDEN_CLAIMS.test(combined)) return null;

    return {
      headline_no: parsed.headline_no.trim(),
      intro_no: parsed.intro_no.trim(),
      bullets_no: bullets,
      orientation_no: parsed.orientation_no.trim(),
    };
  } catch {
    return null;
  }
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
      validateResponse: (text) => parseEditorial(text) !== null,
      fallbackOnInvalidResponse: true,
    });

    const parsed = parseEditorial(raw);
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
