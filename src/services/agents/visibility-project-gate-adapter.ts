import { reviewProjectPage, type ProjectPageReviewInput } from "./visibility-project-page-review";
import { evaluateVisibilityGate, type VisibilityIssue } from "./visibility-quality-gate";

/**
 * Bridge from editorial project checks to the existing Visibility review gate.
 * This is a pure computation, NOT an audit of a live URL and NOT a publishing approval.
 */
export function evaluateProjectVisibilityReview(input: ProjectPageReviewInput) {
  const projectReview = reviewProjectPage(input);
  const issues: VisibilityIssue[] = projectReview.findings.map(finding => ({
    code: finding.severity === "BLOCK" ? "HIGH_RISK_FACT_UNVERIFIED" :
      finding.code === "FAQ_MISSING" ? "MISSING_FAQ" : "HEADING_STRUCTURE",
    evidence: finding.code + (finding.key ? " (" + finding.key + ")" : "") + ": " + finding.detail,
    affectedUrl: input.pageUrl,
  }));
  const gate = evaluateVisibilityGate({
    issues,
    isSitewideChange: false,
    isHighRiskTopic: input.facts.some(fact => ["taxes", "price", "energyClass", "delivery"].includes(fact.key)),
    humanApproved: false,
  });
  return {
    projectReview,
    issues,
    gate,
    // Review statuses must never be confused with permission to publish.
    publicationEligible: false as const,
    canPublish: false as const,
  };
}
