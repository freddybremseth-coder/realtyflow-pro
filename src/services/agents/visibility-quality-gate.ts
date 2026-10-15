/** Visibility quality gate v0.2. Pure and review-only: this module never publishes. */
export type VisibilityIssueCode =
  | "BROKEN_INTERNAL_LINK" | "INDEXING_BLOCKED" | "CANONICAL_MISMATCH"
  | "HTTP_ERROR" | "REDIRECT_MISSING" | "OVERSIZED_IMAGE"
  | "MOBILE_FUNCTION_BROKEN" | "CONTENT_NOT_RENDERED"
  | "MISLEADING_SCHEMA" | "MASS_PUBLICATION_RISK"
  | "SITEWIDE_CHANGE" | "HIGH_RISK_FACT_UNVERIFIED"
  | "METADATA_LENGTH" | "HEADING_STRUCTURE"
  | "WEAK_INTERNAL_LINKS" | "MISSING_FAQ";

export type VisibilityIssue = {
  code: VisibilityIssueCode;
  evidence: string;
  affectedUrl?: string;
};

export type VisibilityGateInput = {
  issues: readonly VisibilityIssue[];
  isSitewideChange: boolean;
  isHighRiskTopic: boolean;
  humanApproved: boolean;
};

const blockingCodes = new Set<VisibilityIssueCode>([
  "BROKEN_INTERNAL_LINK", "INDEXING_BLOCKED", "CANONICAL_MISMATCH",
  "HTTP_ERROR", "REDIRECT_MISSING", "OVERSIZED_IMAGE",
  "MOBILE_FUNCTION_BROKEN", "CONTENT_NOT_RENDERED",
  "MISLEADING_SCHEMA", "MASS_PUBLICATION_RISK",
  "HIGH_RISK_FACT_UNVERIFIED",
]);

/** Fail closed for unverified high-risk claims and global changes. */
export function evaluateVisibilityGate(input: VisibilityGateInput) {
  const blocked = input.issues.filter(issue => blockingCodes.has(issue.code));
  const warnings = input.issues.filter(issue => !blockingCodes.has(issue.code));
  const requiresHumanReview = input.isSitewideChange || input.isHighRiskTopic ||
    input.issues.some(issue => issue.code === "SITEWIDE_CHANGE");
  const canPublish = blocked.length === 0 && (!requiresHumanReview || input.humanApproved);
  return {
    status: blocked.length ? "BLOCKED" as const :
      requiresHumanReview && !input.humanApproved ? "REVIEW_REQUIRED" as const :
      warnings.length ? "APPROVED_WITH_WARNINGS" as const : "APPROVED" as const,
    canPublish,
    blocked,
    warnings,
    requiresHumanReview,
  };
}

/** Human review is independent of scoring; this only proposes an editorial action. */
export type IntentComparison = {
  samePrimaryQuestion: boolean;
  sameUserNeed: boolean;
  distinctJourneyPurpose: boolean;
  existingPageCoversTopic: boolean;
  existingPageNeedsUpdate: boolean;
};
export function recommendContentAction(input: IntentComparison) {
  if (input.samePrimaryQuestion && input.sameUserNeed && !input.distinctJourneyPurpose)
    return "MERGE" as const;
  if (input.distinctJourneyPurpose) return "KEEP_BOTH" as const;
  if (input.existingPageCoversTopic || input.existingPageNeedsUpdate)
    return "UPDATE_EXISTING" as const;
  return "CREATE_NEW" as const;
}
