/**
 * Phase 7 — Content Quality Gate. Gir en Quality Score 0–100 før approval/
 * publisering. MEN quality score alene gir aldri fullmakt — Policy Engine
 * bestemmer. Sensitive fakta (pris/skatt/jus/marked/lån) UTEN kilde → approval.
 */

import type { GeneratedAsset } from "./schemas";
import type { BrandContext } from "./brand-brain";
import { findProductionDirection } from "./channel-format";
import { brandSupportsOwnership, findOwnershipClaims, unsupportedOutcomeClaims } from "./claim-guard";

/** Emner som krever verifiserbar kilde/provenance før publisering. */
export const SENSITIVE_FACT_TERMS = [
  "pris", "price", "€", "kr", "skatt", "tax", "moms", "lov", "legal", "jus", "rente", "mortgage", "lån",
  "avkastning", "yield", "statistikk", "market statistics", "prisvekst", "tilgjeng", "availability", "kvadratmeter", "m²",
];

export interface QualityChecks {
  brandFit: boolean;
  hasCta: boolean;
  channelFit: boolean;
  languageQuality: boolean;
  genomeCompleteness: number;
  attributionReady: boolean;
  duplicateFree: boolean;
  formatClean: boolean;
  claimsVerified: boolean;
  roleConsistent: boolean;
}

export interface QualityResult {
  score: number;
  checks: QualityChecks;
  sensitiveClaimsWithoutSource: string[];
  unsupportedOutcomeClaims: string[];
  roleViolations: string[];
  requiresApproval: boolean;
  reasons: string[];
}

export interface QualityOptions {
  brandTerms?: string[];
  duplicateFree?: boolean;
  brand?: Pick<BrandContext, "allowedClaims" | "services"> & { ownsInventory?: boolean };
  generated?: boolean;
}

const INVENTORY_QUALITY_MARKERS: Array<{ label: string; re: RegExp }> = [
  {
    label: "energy label implies efficiency",
    re: /(?:energimerk(?:ing|ingen|et)?|energiklasse|energy\s+(?:rating|label|class))[^.!?]{0,120}(?:indikasjon\s+på\s+energieffektivitet|tyder\s+på\s+energieffektivitet|energieffektivitet|energy\s+efficien(?:cy|t))/i,
  },
  {
    label: "subjective opportunity",
    re: /\b(?:spennende|attraktiv|lovende|exciting|attractive|promising)\s+(?:mulighet|opportunity)\b/i,
  },
  {
    label: "subjective property praise",
    re: /\b(?:nydelig(?:e|t)?|vakker|vakre|beautiful|lovely)\s+(?:bungalow(?:en)?|bolig(?:en)?|villa(?:en)?|leilighet(?:en)?|eiendom(?:men)?|home|property|villa|apartment)\b/i,
  },
  {
    label: "spacious design",
    re: /\b(?:romslig(?:e|t)?|spacious)\s+(?:design|planløsning|layout)\b/i,
  },
  {
    label: "modern amenities",
    re: /\b(?:moderne|modern)\s+(?:fasiliteter|amenities|features)\b/i,
  },
  {
    label: "holiday and permanent suitability",
    re: /\b(?:ideelt?|perfekt|suitable|ideal|perfect)[^.!?]{0,80}(?:ferie|holiday)[^.!?]{0,80}(?:permanent|helår|year[-\s]?round)|\b(?:ferie|holiday)[^.!?]{0,80}(?:og|and)[^.!?]{0,40}(?:permanent|helår|year[-\s]?round)/i,
  },
  {
    label: "dream-home fulfillment",
    re: /(?:gjøre|realisere|make|turn)[^.!?]{0,80}(?:drømmen|dream)[^.!?]{0,80}(?:hjem\s+i\s+solen|home\s+in\s+the\s+sun)[^.!?]{0,40}(?:virkelighet|reality)/i,
  },
];

function inventoryQualityViolations(caption: string, factSources: Array<{ claim: string; source: string }>): string[] {
  return INVENTORY_QUALITY_MARKERS
    .filter((marker) => marker.re.test(caption))
    .filter((marker) => !factSources.some((source) => marker.re.test(source.claim ?? "")))
    .map((marker) => marker.label);
}

function textOf(a: GeneratedAsset): string {
  return [a.headline, a.body, a.cta].filter(Boolean).join(" ").toLowerCase();
}

export function contentQualityGate(asset: GeneratedAsset, opts: QualityOptions = {}): QualityResult {
  const text = textOf(asset);
  const sourcedClaims = new Set(asset.factSources.map((f) => f.claim.toLowerCase()));
  const sensitiveClaimsWithoutSource: string[] = [];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hits = (haystack: string, term: string) =>
    /^[a-zæøå ]+$/i.test(term) ? new RegExp(`(^|[^a-zæøå0-9])${escape(term)}([^a-zæøå0-9]|$)`, "i").test(haystack) : haystack.includes(term);

  for (const term of SENSITIVE_FACT_TERMS) {
    if (hits(text, term)) {
      const covered = Array.from(sourcedClaims).some((c) => hits(c, term));
      if (!covered) sensitiveClaimsWithoutSource.push(term);
    }
  }

  const g = asset.genome;
  const requiredDims = ["channel", "format", "hookType", "ctaType", "goal"] as const;
  const present = requiredDims.filter((d) => g[d] != null).length;
  const genomeCompleteness = present / requiredDims.length;
  const caption = [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n");
  const formatMarkers = findProductionDirection(caption);

  const generated = opts.generated ?? true;
  const hasGenomePropertyId = typeof (g as { propertyId?: unknown }).propertyId === "string";
  const hasInventoryFactSource = asset.factSources.some((f) => /RealtyFlow\s+Inventory/i.test(f.source ?? ""));
  const inventoryBound = hasGenomePropertyId || hasInventoryFactSource;
  const baseOutcomeViolations = generated
    ? unsupportedOutcomeClaims(caption, asset.factSources, { inventoryBound })
    : [];
  const inventoryViolations = generated && inventoryBound
    ? inventoryQualityViolations(caption, asset.factSources)
    : [];
  const outcomeViolations = Array.from(new Set([...baseOutcomeViolations, ...inventoryViolations]));
  const roleViolations = generated && !brandSupportsOwnership(opts.brand) ? findOwnershipClaims(caption) : [];

  const brandFit = !opts.brandTerms?.length || opts.brandTerms.some((t) => text.includes(t.toLowerCase()));
  const checks: QualityChecks = {
    brandFit,
    hasCta: !!asset.cta,
    channelFit: g.channel === asset.channel,
    languageQuality: (asset.body?.trim().length ?? 0) >= 20,
    genomeCompleteness,
    attributionReady: !!asset.contentId,
    duplicateFree: opts.duplicateFree ?? true,
    formatClean: formatMarkers.length === 0,
    claimsVerified: outcomeViolations.length === 0,
    roleConsistent: roleViolations.length === 0,
  };

  const weights = { brandFit: 10, hasCta: 10, channelFit: 10, languageQuality: 10, genomeCompleteness: 10, attributionReady: 10, duplicateFree: 10, formatClean: 10, claimsVerified: 10, roleConsistent: 10 };
  let score = Math.round(
    (checks.brandFit ? weights.brandFit : 0) +
      (checks.hasCta ? weights.hasCta : 0) +
      (checks.channelFit ? weights.channelFit : 0) +
      (checks.languageQuality ? weights.languageQuality : 0) +
      checks.genomeCompleteness * weights.genomeCompleteness +
      (checks.attributionReady ? weights.attributionReady : 0) +
      (checks.duplicateFree ? weights.duplicateFree : 0) +
      (checks.formatClean ? weights.formatClean : 0) +
      (checks.claimsVerified ? weights.claimsVerified : 0) +
      (checks.roleConsistent ? weights.roleConsistent : 0),
  );

  if (sensitiveClaimsWithoutSource.length) score = Math.min(score, 90);

  const reasons: string[] = [];
  if (sensitiveClaimsWithoutSource.length) reasons.push(`Sensitive fakta uten kilde: ${sensitiveClaimsWithoutSource.join(", ")} → krever godkjenning.`);
  if (outcomeViolations.length) reasons.push(`CLAIM_NOT_VERIFIED: udekket utfall/property-påstand (${outcomeViolations.join(", ")}) — krever uavhengig kilde eller omskriving.`);
  if (roleViolations.length) reasons.push(`BRAND_ROLE_MISMATCH: eierskaps-/rollepåstand (${roleViolations.join(", ")}) uten støtte i Brand Brain.`);
  if (!checks.formatClean) reasons.push(`CHANNEL_FORMAT_MISMATCH: captionen bryter kanalformatet (${formatMarkers.join(", ")}).`);
  if (!checks.hasCta) reasons.push("Mangler CTA — ingen konverteringsvei.");
  if (!checks.channelFit) reasons.push("Genome-kanal matcher ikke asset-kanal.");
  if (genomeCompleteness < 1) reasons.push("Ufullstendig content genome (svekker læring).");

  return {
    score,
    checks,
    sensitiveClaimsWithoutSource,
    unsupportedOutcomeClaims: outcomeViolations,
    roleViolations,
    requiresApproval: sensitiveClaimsWithoutSource.length > 0,
    reasons,
  };
}