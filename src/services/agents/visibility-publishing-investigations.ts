import type { BrandPublicationStatus } from "./seo-brand-publisher";

/**
 * Publication blockages are a distinct evidence category from technical SEO
 * observations. Reading this data never creates an approval or publication.
 */
export type VisibilityPublishingInvestigation = {
  key: string;
  brandId: string;
  page: string;
  source: "Sam metadata-publiseringskontroll";
  category: "PUBLISHING_BLOCKED";
  evidence: string;
  title: string;
  nextStep: string;
  requiresApproval: false;
  publicationEligible: false;
};

/** Reject untrusted URL/metadata guesses; only copy recorded status and page. */
export function visibilityPublishingInvestigations(
  statuses: readonly BrandPublicationStatus[] | null | undefined,
): VisibilityPublishingInvestigation[] {
  const byBrand = new Map<string, VisibilityPublishingInvestigation>();
  for (const status of statuses ?? []) {
    if (status.status !== "blocked" || !status.brandId) continue;
    const brandId = status.brandId;
    if (byBrand.has(brandId)) continue;
    const evidence = String(status.reason || "").trim() || "Publisering er blokkert uten registrert begrunnelse.";
    byBrand.set(brandId, {
      key: "visibility:publishing:" + brandId,
      brandId,
      page: status.page || "/",
      source: "Sam metadata-publiseringskontroll",
      category: "PUBLISHING_BLOCKED",
      title: "Undersøk blokkert metadata-publisering",
      evidence,
      nextStep: "Kontroller offentlig hovedside, canonical, riktig GitHub-repo og målfil mot faktisk deploy. Dokumenter avviket før publiseringsforslag opprettes.",
      requiresApproval: false,
      publicationEligible: false,
    });
  }
  return [...byBrand.values()].sort((a, b) => a.brandId.localeCompare(b.brandId));
}
