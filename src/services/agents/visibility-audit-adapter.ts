import type { SiteAudit } from "./seo-audit";
import { evaluateVisibilityGate, type VisibilityIssue } from "./visibility-quality-gate";

/**
 * Conservative adapter for the existing bounded public SEO audit.
 * These are diagnostic signals, NOT publication preflight evidence.
 * Missing audit data remains UNKNOWN rather than being treated as a pass.
 */
export function visibilityAuditSummary(audit: SiteAudit) {
  const issues: VisibilityIssue[] = [];
  if (audit.home.status !== null && audit.home.status !== 200) {
    issues.push({ code: "HTTP_ERROR", evidence: "Homepage status: " + audit.home.status, affectedUrl: audit.base });
  }
  // Potential indexing issue only: some routes deliberately use noindex.\n  if (audit.home.robotsMeta?.match(/\bnoindex\b/i) || audit.home.xRobots?.match(/\bnoindex\b/i) ||
      audit.robots.googlebotBlocked === true) {
    issues.push({ code: "INDEXING_BLOCKED", evidence: "Explicit noindex or site-wide Googlebot disallow", affectedUrl: audit.base });
  }
  if (audit.observations.some(item => /canonical refers to a different host|canonical is not a valid url/i.test(item))) {
    issues.push({ code: "CANONICAL_MISMATCH", evidence: "Homepage canonical host/URL requires inspection", affectedUrl: audit.base });
  }
  if (audit.home.jsonLdParseErrors && audit.home.jsonLdParseErrors > 0) {
    issues.push({ code: "HEADING_STRUCTURE", evidence: "Unparseable JSON-LD requires review (" + audit.home.jsonLdParseErrors + ")", affectedUrl: audit.base });
  }
  if (audit.home.h1Count === 0) {
    issues.push({ code: "HEADING_STRUCTURE", evidence: "No server-rendered homepage H1", affectedUrl: audit.base });
  }
  const gate = evaluateVisibilityGate({ issues, isSitewideChange: false, isHighRiskTopic: false, humanApproved: false });
  const incomplete = audit.home.status === null || audit.robots.status === null || audit.sitemap.status === null ||
    audit.limitations.some(item => /failed|unavailable|unknown/i.test(item));
  return {
    brandId: audit.brandId,
    sampledOnly: true as const,
    incomplete,
    issues,
    // A site audit must NEVER authorize publication; it lacks change-specific verification.
    publicationEligible: false as const,
    diagnosticStatus: incomplete ? "UNKNOWN" as const : gate.blocked.length ? "ACTION_REQUIRED" as const : gate.warnings.length ? "REVIEW_RECOMMENDED" as const : "OBSERVED_NO_BLOCKERS" as const,
  };
}
