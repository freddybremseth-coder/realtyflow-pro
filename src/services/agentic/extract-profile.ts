/**
 * Profil-ekstraksjon for lead-intake. Bruker askClaude (JSON) med automatisk
 * provider-fallback; hvis AI ikke er tilgjengelig eller svarer ugyldig, faller
 * den tilbake til en deterministisk heuristikk slik at flyten aldri stopper.
 */

import { askClaude } from "@/services/ai/claude-client";
import type { ToolContext } from "@/lib/agentic/tool-registry";
import type { ExtractionResult, RawInquiry } from "@/services/workflows/lead-intake";
import { heuristicExtract } from "@/services/agentic/extract-heuristic";

export { heuristicExtract, parseBudgetEur } from "@/services/agentic/extract-heuristic";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const SYSTEM = "Du er en eiendoms-lead-analytiker. Trekk ut kjøperprofil fra henvendelsen som JSON. Ikke finn på verdier — utelat felter du ikke er sikker på.";

function buildPrompt(inquiry: RawInquiry): string {
  return [
    "Henvendelse:",
    `Kilde: ${inquiry.source}`,
    inquiry.contactName ? `Navn: ${inquiry.contactName}` : "",
    `Melding: ${inquiry.message}`,
    "",
    'Svar KUN med JSON: {"name"?:string,"budgetMaxEur"?:number,"budgetMinEur"?:number,"areas":string[],"propertyType"?:string,"bedroomsMin"?:number,"mustHaves":string[],"exclusions":string[],"intentScore"?:number,"confidence":number}',
    "confidence er 0..1 for hvor sikker uttrekket er. budget i EUR (tall).",
  ].filter(Boolean).join("\n");
}

function cleanJson(raw: string): string {
  return raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

export async function extractProfile(inquiry: RawInquiry, _ctx: ToolContext): Promise<ExtractionResult> {
  try {
    const raw = await askClaude(buildPrompt(inquiry), { responseMimeType: "application/json", model: "haiku", maxTokens: 600, systemPrompt: SYSTEM });
    const p = JSON.parse(cleanJson(raw)) as Record<string, unknown>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
    const numOrU = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    return {
      profile: {
        name: (p.name as string) || inquiry.contactName,
        budgetMaxEur: numOrU(p.budgetMaxEur),
        budgetMinEur: numOrU(p.budgetMinEur),
        areas: arr(p.areas),
        propertyType: (p.propertyType as string) || undefined,
        bedroomsMin: numOrU(p.bedroomsMin),
        mustHaves: arr(p.mustHaves),
        exclusions: arr(p.exclusions),
        intentScore: numOrU(p.intentScore),
      },
      confidence: clamp01(typeof p.confidence === "number" ? p.confidence : 0.8),
      model: "claude-haiku-4-5",
    };
  } catch {
    return heuristicExtract(inquiry);
  }
}
