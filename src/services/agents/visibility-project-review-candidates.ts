import type { SiteAudit } from "./seo-audit";

/**
 * Identify public, already sampled project URLs for a *later* editorial fact review.
 * SEO HTTP snapshots do not provide commercial claims or primary source verification.
 * Consequently every candidate stays NOT_REVIEWED, never scored or cleared.
 */
export function projectReviewCandidates(audit: SiteAudit) {
  if (audit.brandId !== "zeneco") return [];
  return audit.samples.filter(page =>
    /^\/(?:eiendommer|properties|immobilien|propiedades)\/[^/]+\/?$/i.test(page.path)
  ).slice(0, 3).map(page => ({
    url: new URL(page.path, audit.base).href,
    status: "NOT_REVIEWED" as const,
    hasHttpEvidence: page.status === 200,
    factsVerified: false as const,
    publicationEligible: false as const,
    nextAction: "Collect actual project claims and authoritative provenance before invoking project review",
  }));
}
