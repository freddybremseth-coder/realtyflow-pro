/**
 * Phase 7.1L — kvalitativ/komparativ påstandsverifisering for AI-generert copy.
 *
 * Gapet: en generert caption sa «de bidrar til lavere energikostnader» med
 * source=generated og factSources=[]. Det er en MÅLBAR/komparativ utfallspåstand
 * og skal ALDRI passere uten uavhengig provenance — selv om den ikke inneholder
 * eksplisitte tall.
 *
 * To separate porter:
 *  1) OUTCOME/COMPARATIVE claims → krever uavhengig factSource (Brand Brain
 *     positionering teller IKKE som kilde). Uten dekning → CLAIM_NOT_VERIFIED.
 *  2) OWNERSHIP/role claims («våre boliger») → kun tillatt hvis Brand Context
 *     eksplisitt støtter eier-/utbygger-rolle. Ellers → BRAND_ROLE_MISMATCH.
 */

import type { BrandContext } from "./brand-brain";

/**
 * Målbare/komparative utfallspåstander (engelsk + norsk). Disse lover et
 * konkret økonomisk/ytelsesmessig utfall og krever uavhengig kilde.
 */
const OUTCOME_CLAIM_MARKERS: Array<{ label: string; re: RegExp }> = [
  // ── Energi/strøm/forbruk ──────────────────────────────────────────────
  { label: "lower energy costs", re: /lower(?:s|ed|ing)?\s+energy\s+costs?/i },
  { label: "lavere energikostnader", re: /laver[et]\s+energikostnad(?:er)?/i },
  { label: "lavere strømregning", re: /laver[et]\s+strøm(?:regning(?:er)?|utgifter|kostnad(?:er)?)/i },
  { label: "lower electricity bills", re: /lower\s+electricity\s+bills?/i },
  { label: "reduced consumption", re: /reduce[ds]?\s+(?:energy\s+)?consumption/i },
  { label: "redusert energiforbruk", re: /(?:redusert|laver[et])\s+(?:energi)?forbruk/i },
  // ── Kostnader generelt ────────────────────────────────────────────────
  { label: "reduced costs", re: /reduce[ds]?\s+(?:running\s+|operating\s+|maintenance\s+)?costs?/i },
  { label: "lower running costs", re: /lower\s+(?:running|operating)\s+costs?/i },
  { label: "lavere kostnader", re: /laver[et]\s+(?:drifts?|vedlikeholds?)?kostnad(?:er)?/i },
  { label: "lower maintenance", re: /(?:lower|reduced)\s+maintenance/i },
  { label: "lavere vedlikehold", re: /laver[et]\s+vedlikehold/i },
  { label: "lower tax", re: /lower\s+tax(?:es)?/i },
  { label: "lavere skatt", re: /laver[et]\s+skatt/i },
  // ── Sparing/penger ────────────────────────────────────────────────────
  { label: "save money", re: /sav(?:e|es|ing|ings)\s+money/i },
  { label: "sparer penger", re: /spar(?:er|e|t)\s+penger/i },
  { label: "guaranteed savings", re: /guarantee[ds]?\s+savings?/i },
  // ── Avkastning/investering/verdi ──────────────────────────────────────
  { label: "higher return", re: /higher\s+returns?/i },
  { label: "higher ROI", re: /higher\s+roi|better\s+roi/i },
  { label: "høyere avkastning", re: /høyere\s+avkastning/i },
  { label: "guaranteed return", re: /guarantee[ds]?\s+returns?/i },
  { label: "garantert avkastning", re: /garantert?\s+avkastning/i },
  { label: "better investment", re: /better\s+investment/i },
  { label: "bedre investering", re: /bedre\s+investering/i },
  { label: "more profitable", re: /more\s+profitable/i },
  { label: "lønnsomt", re: /(?:mer\s+)?lønnsom[t]?/i },
  { label: "increased property value", re: /increase[ds]?\s+(?:property\s+|resale\s+)?value|value\s+appreciation|resale\s+appreciation/i },
  { label: "høyere verdi", re: /(?:høyere|økt)\s+(?:bolig|eiendoms?)?verdi|verdiøkning/i },
  { label: "higher rental income", re: /higher\s+rental\s+income/i },
  { label: "høyere leieinntekt", re: /høyere\s+leieinntekt(?:er)?/i },
  { label: "faster sale", re: /faster\s+sale|sells?\s+faster/i },
  { label: "raskere salg", re: /raskere\s+salg|selges?\s+raskere/i },
  // ── Generelle garanti-ord (sterk risiko) ──────────────────────────────
  { label: "guaranteed", re: /\bguaranteed\b/i },
  { label: "garantert", re: /\bgarantert?e?\b/i },
];

/** Finn målbare/komparative utfallspåstander i teksten (labels). */
export function findOutcomeClaims(text: string | null | undefined): string[] {
  const t = text ?? "";
  return OUTCOME_CLAIM_MARKERS.filter((m) => m.re.test(t)).map((m) => m.label);
}

/**
 * Utfallspåstander i captionen som IKKE er dekket av en uavhengig factSource.
 * En påstand regnes som dekket hvis minst én factSource-claim treffer SAMME
 * utfallsmarkør. Brand Brain-positionering er bevisst IKKE en gyldig kilde her.
 */
export function unsupportedOutcomeClaims(
  caption: string | null | undefined,
  factSources: Array<{ claim: string; source: string }> = [],
): string[] {
  const present = OUTCOME_CLAIM_MARKERS.filter((m) => m.re.test(caption ?? ""));
  if (!present.length) return [];
  const sourced = present.filter((m) => factSources.some((f) => m.re.test(f.claim ?? "")));
  const sourcedLabels = new Set(sourced.map((m) => m.label));
  return present.filter((m) => !sourcedLabels.has(m.label)).map((m) => m.label);
}

/**
 * Eierskaps-/rollepåstander: «våre boliger/villaer/eiendommer», «our homes» osv.
 * Impliserer at merket eier/utvikler boligene. Norsk å/ø er ikke \w, så vi
 * bruker eksplisitte grenser i stedet for \b rundt norske ord.
 */
const OWNERSHIP_MARKERS: Array<{ label: string; re: RegExp }> = [
  { label: "our homes", re: /\bour\s+homes?\b/i },
  { label: "our properties", re: /\bour\s+propert(?:y|ies)\b/i },
  { label: "our villas", re: /\bour\s+villas?\b/i },
  { label: "our apartments", re: /\bour\s+apartments?\b/i },
  { label: "our developments", re: /\bour\s+developments?\b/i },
  { label: "våre boliger", re: /(?:^|[^a-zæøå])vår[et]?\s+bolig(?:er|en|ene)?(?![a-zæøå])/i },
  { label: "våre villaer", re: /(?:^|[^a-zæøå])vår[et]?\s+villa(?:er|en|ene)?(?![a-zæøå])/i },
  { label: "våre eiendommer", re: /(?:^|[^a-zæøå])vår[et]?\s+eiendom(?:mer|men|mene)?(?![a-zæøå])/i },
  { label: "våre leiligheter", re: /(?:^|[^a-zæøå])vår[et]?\s+leilighet(?:er|en|ene)?(?![a-zæøå])/i },
  { label: "våre prosjekter", re: /(?:^|[^a-zæøå])vår[et]?\s+prosjekt(?:er|et|ene)?(?![a-zæøå])/i },
];

/** Finn eierskaps-/rollepåstander i teksten (labels). */
export function findOwnershipClaims(text: string | null | undefined): string[] {
  const t = text ?? "";
  return OWNERSHIP_MARKERS.filter((m) => m.re.test(t)).map((m) => m.label);
}

const OWNERSHIP_TOKENS = [
  "utbygger", "utvikler", "developer", "vi eier", "vi bygger", "vi utvikler",
  "we build", "we develop", "we own", "eiendomsutvikler", "boligutvikler",
];

/**
 * Støtter Brand Context eksplisitt eier-/utbygger-rolle? Fail-closed: en
 * mangler default betyr rådgiver/formidler (ikke eier). Kan settes eksplisitt
 * via `ownsInventory=true` eller ved eierskaps-token i services/allowedClaims.
 */
export function brandSupportsOwnership(brand?: Pick<BrandContext, "allowedClaims" | "services"> & { ownsInventory?: boolean }): boolean {
  if (!brand) return false;
  if (brand.ownsInventory === true) return true;
  const hay = [...(brand.services ?? []), ...(brand.allowedClaims ?? [])].join(" ").toLowerCase();
  return OWNERSHIP_TOKENS.some((t) => hay.includes(t));
}
