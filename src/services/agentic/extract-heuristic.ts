/**
 * Deterministisk profil-heuristikk (ingen AI-avhengighet) — fallback for
 * extract-profile når AI ikke er tilgjengelig eller svarer ugyldig. Ren og
 * testbar.
 */

import type { ExtractionResult, RawInquiry } from "@/services/workflows/lead-intake";

export const KNOWN_AREAS = [
  "albir", "finestrat", "polop", "altea", "calpe", "calp", "denia", "dénia", "javea", "jávea", "xàbia",
  "moraira", "benidorm", "alfaz", "la nucia", "guardamar", "torrevieja", "orihuela",
  "oslo", "bergen", "trondheim", "stavanger", "sandefjord", "tønsberg", "larvik",
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function parseBudgetEur(text: string): number | undefined {
  const t = text.toLowerCase();
  const k = t.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (k) return Math.round(parseFloat(k[1].replace(",", ".")) * 1000);
  const grouped = t.match(/(?:€|eur|budsjett|budget|maks|maksimalt|under|rundt|ca\.?)\D{0,8}(\d{1,3}(?:[ .]\d{3})+)/);
  if (grouped) return parseInt(grouped[1].replace(/[ .]/g, ""), 10);
  const plain = t.match(/\b(\d{6,7})\b/);
  if (plain) return parseInt(plain[1], 10);
  return undefined;
}

export function heuristicExtract(inquiry: RawInquiry): ExtractionResult {
  const text = inquiry.message.toLowerCase();
  const budgetMaxEur = parseBudgetEur(text);
  const areas = Array.from(new Set(KNOWN_AREAS.filter((a) => text.includes(a)).map((a) => cap(a))));
  const beds = text.match(/(\d+)\s*(soverom|sov|bedroom|bed|rom)/);
  const bedroomsMin = beds ? Number(beds[1]) : undefined;
  const propertyType = /villa/.test(text)
    ? "villa"
    : /leilighet|apartment|apartamento/.test(text)
      ? "apartment"
      : /rekkehus|townhouse/.test(text)
        ? "townhouse"
        : undefined;
  return {
    profile: { name: inquiry.contactName, budgetMaxEur, areas, propertyType, bedroomsMin, mustHaves: [], exclusions: [] },
    confidence: budgetMaxEur && areas.length > 0 ? 0.55 : 0.35,
    model: "heuristic",
  };
}
