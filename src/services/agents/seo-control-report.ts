import type { SiteAudit } from "./seo-audit";
import type { ReferralPreflightCheck } from "./seo-referral-health";

export type SEOControlReport = {
  checkedAt: string;
  sites: Array<{
    brandId: string; checkedAt: string; pagesChecked: number;
    findings: number; incomplete: boolean; sampledPaths: string[];
    accessibilityFindings: number; invalidStructuredData: number;
    pagesWithContactOrForm: number; qualityPagesChecked: number;
  }>;
  referralsAvailable: boolean;
  leadsAvailable: boolean;
  collector: { passed: number; blocked: number; unknown: number } | null;
};

/** Counts HTTP observations, never completed repairs or inferred organic leads. */
export function buildSEOControlReport(input: {
  audits: readonly SiteAudit[]; referralsAvailable: boolean; leadsAvailable: boolean;
  collectorPreflight: readonly ReferralPreflightCheck[] | null;
  checkedAt?: string;
}): SEOControlReport {
  return {
    checkedAt: input.checkedAt || new Date().toISOString(),
    referralsAvailable: input.referralsAvailable, leadsAvailable: input.leadsAvailable,
    collector: input.collectorPreflight ? {
      passed: input.collectorPreflight.filter(item => item.status === "pass").length,
      blocked: input.collectorPreflight.filter(item => item.status === "blocked").length,
      unknown: input.collectorPreflight.filter(item => item.status === "unknown").length,
    } : null,
    sites: input.audits.map(audit => {
      const qualities = [audit.home.quality, ...audit.samples.map(page => page.quality)]
        .filter((quality): quality is NonNullable<typeof quality> => quality !== undefined);
      return {
        brandId: audit.brandId, checkedAt: audit.checkedAt,
        pagesChecked: Number(audit.home.status !== null) + audit.samples.filter(page => page.status !== null).length,
        findings: audit.observations.length,
        incomplete: audit.home.status === null || audit.robots.status === null || audit.sitemap.status === null ||
          audit.limitations.some(line => /unavailable|unknown|failed|not crawled/i.test(line)),
        sampledPaths: audit.samples.map(page => page.path),
        qualityPagesChecked: qualities.length,
        accessibilityFindings: qualities.reduce((sum, quality) => sum + Number(!quality.language) +
          Number(!quality.mobileViewport) + quality.imagesWithoutAlt, 0),
        invalidStructuredData: qualities.reduce((sum, quality) => sum + quality.invalidStructuredDataBlocks, 0),
        pagesWithContactOrForm: qualities.filter(quality => quality.contactLinkPresent || quality.formPresent).length,
      };
    }),
  };
}
