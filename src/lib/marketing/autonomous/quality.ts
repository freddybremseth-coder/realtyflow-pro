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
  genomeCompleteness: number; // 0..1
  attributionReady: boolean;
  duplicateFree: boolean;
  /** Captionen er ren kundevendt tekst (ingen produksjonsanvisninger). */
  formatClean: boolean;
  /** Ingen udekket målbar/komparativ utfallspåstand (uten uavhengig kilde). */
  claimsVerified: boolean;
  /** Ingen eierskaps-/rollepåstand i strid med Brand Brain. */
  roleConsistent: boolean;
}

export interface QualityResult {
  score: number; // 0..100
  checks: QualityChecks;
  sensitiveClaimsWithoutSource: string[];
  /** Målbare/komparative utfallspåstander uten uavhengig factSource. */
  unsupportedOutcomeClaims: string[];
  /** Eierskaps-/rollepåstander i strid med Brand Brain. */
  roleViolations: string[];
  requiresApproval: boolean;
  reasons: string[];
}

export interface QualityOptions {
  brandTerms?: string[];
  /** Fra novelty-motoren: er innholdet tilstrekkelig unikt? */
  duplicateFree?: boolean;
  /** Brand Context — brukes for rolle-/eierskapsgaten (advisor vs eier). */
  brand?: Pick<BrandContext, "allowedClaims" | "services"> & { ownsInventory?: boolean };
  /**
   * Er innholdet AI-generert? Utfalls-/rollegatene gjelder KUN generert copy —
   * menneske-/legacy-forfattet innhold self-sources og er allerede review-et.
   * Default true (default source_type er «generated»).
   */
  generated?: boolean;
}

function textOf(a: GeneratedAsset): string {
  return [a.headline, a.body, a.cta].filter(Boolean).join(" ").toLowerCase();
}

export function contentQualityGate(asset: GeneratedAsset, opts: QualityOptions = {}): QualityResult {
  const text = textOf(asset);
  const sourcedClaims = new Set(asset.factSources.map((f) => f.claim.toLowerCase()));

  // Sensitive fakta uten kilde. Ordgrense-matching for alfabetiske termer, så
  // «kr» ikke treffer inne i «bærekraftige» og «lov» ikke i «lovende».
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

  // Captionen (den faktiske Meta-payloaden) skal være ren kundevendt tekst.
  const caption = [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n");
  const productionMarkers = findProductionDirection(caption);

  // Utfalls-/rollegatene gjelder KUN generert copy. Legacy/menneske-forfattet
  // self-sources (factSources = body) → utfallspåstander blir automatisk dekket.
  const generated = opts.generated ?? true;
  const outcomeViolations = generated ? unsupportedOutcomeClaims(caption, asset.factSources) : [];
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
    formatClean: productionMarkers.length === 0,
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

  // Point 4: en uverifisert sensitiv faktapåstand (pris/skatt/rente/marked …)
  // skal aldri gi full score. Den blokkerer/utløser allerede approval, men
  // score må også reflektere risikoen — cap under 100, symmetrisk med de tre
  // andre bruddene (utfall/rolle/format) som hver koster 10 poeng.
  if (sensitiveClaimsWithoutSource.length) score = Math.min(score, 90);

  const reasons: string[] = [];
  if (sensitiveClaimsWithoutSource.length) reasons.push(`Sensitive fakta uten kilde: ${sensitiveClaimsWithoutSource.join(", ")} → krever godkjenning.`);
  if (outcomeViolations.length) reasons.push(`CLAIM_NOT_VERIFIED: udekket utfallspåstand (${outcomeViolations.join(", ")}) — krever uavhengig kilde.`);
  if (roleViolations.length) reasons.push(`BRAND_ROLE_MISMATCH: eierskaps-/rollepåstand (${roleViolations.join(", ")}) uten støtte i Brand Brain.`);
  if (!checks.formatClean) reasons.push(`CHANNEL_FORMAT_MISMATCH: captionen inneholder produksjonsanvisninger (${productionMarkers.join(", ")}).`);
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
