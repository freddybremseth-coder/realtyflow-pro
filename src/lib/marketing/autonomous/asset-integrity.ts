/**
 * Phase 7.1C — asset-integritet. Et approved_asset_hash binder GODKJENNINGEN til
 * nøyaktig innhold + media + brand + konto + kanal. Executor verifiserer hashen
 * FØR publisering — endres copy/media/konto etter godkjenning, feiler den
 * (ASSET_MODIFIED). Hindrer at noe annet enn det godkjente publiseres.
 */

import { sha256 } from "@/lib/agentic";

export interface AssetHashParts {
  sourceContentId: string;
  finalCopy: string;
  finalMedia: string; // stabil representasjon av media (url-er/type)
  brandId: string;
  accountId: string;
  channel: string;
  propertyIds: string[];
  cta: string;
  factSources: Array<{ claim: string; source: string }>;
}

/** Stabil, kanonisk hash av de godkjenningsbærende feltene. */
export function approvedAssetHash(p: AssetHashParts): string {
  const canonical = JSON.stringify([
    p.sourceContentId,
    p.finalCopy ?? "",
    p.finalMedia ?? "",
    p.brandId,
    p.accountId,
    p.channel,
    [...(p.propertyIds ?? [])].sort(),
    p.cta ?? "",
    [...(p.factSources ?? [])].map((f) => `${f.claim}::${f.source}`).sort(),
  ]);
  return `assethash_${sha256(canonical)}`;
}

export function verifyAssetHash(expected: string, parts: AssetHashParts): boolean {
  return !!expected && approvedAssetHash(parts) === expected;
}
