/**
 * Phase 7 — Content Quality Gate. Gir en Quality Score 0–100 før approval/
 * publisering. MEN quality score alene gir aldri fullmakt — Policy Engine
 * bestemmer. Sensitive fakta (pris/skatt/jus/marked/lån) UTEN kilde → approval.
 */

import type { GeneratedAsset } from "./schemas";

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
}

export interface QualityResult {
  score: number; // 0..100
  checks: QualityChecks;
  sensitiveClaimsWithoutSource: string[];
  requiresApproval: boolean;
  reasons: string[];
}

export interface QualityOptions {
  brandTerms?: string[];
  /** Fra novelty-motoren: er innholdet tilstrekkelig unikt? */
  duplicateFree?: boolean;
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

  const brandFit = !opts.brandTerms?.length || opts.brandTerms.some((t) => text.includes(t.toLowerCase()));
  const checks: QualityChecks = {
    brandFit,
    hasCta: !!asset.cta,
    channelFit: g.channel === asset.channel,
    languageQuality: (asset.body?.trim().length ?? 0) >= 20,
    genomeCompleteness,
    attributionReady: !!asset.contentId,
    duplicateFree: opts.duplicateFree ?? true,
  };

  const weights = { brandFit: 15, hasCta: 15, channelFit: 15, languageQuality: 15, genomeCompleteness: 15, attributionReady: 15, duplicateFree: 10 };
  const score = Math.round(
    (checks.brandFit ? weights.brandFit : 0) +
      (checks.hasCta ? weights.hasCta : 0) +
      (checks.channelFit ? weights.channelFit : 0) +
      (checks.languageQuality ? weights.languageQuality : 0) +
      checks.genomeCompleteness * weights.genomeCompleteness +
      (checks.attributionReady ? weights.attributionReady : 0) +
      (checks.duplicateFree ? weights.duplicateFree : 0),
  );

  const reasons: string[] = [];
  if (sensitiveClaimsWithoutSource.length) reasons.push(`Sensitive fakta uten kilde: ${sensitiveClaimsWithoutSource.join(", ")} → krever godkjenning.`);
  if (!checks.hasCta) reasons.push("Mangler CTA — ingen konverteringsvei.");
  if (!checks.channelFit) reasons.push("Genome-kanal matcher ikke asset-kanal.");
  if (genomeCompleteness < 1) reasons.push("Ufullstendig content genome (svekker læring).");

  return {
    score,
    checks,
    sensitiveClaimsWithoutSource,
    requiresApproval: sensitiveClaimsWithoutSource.length > 0,
    reasons,
  };
}
