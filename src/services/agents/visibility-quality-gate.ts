/** Visibility quality gate v0.2. Pure and review-only: this module never publishes. */
export type VisibilityIssueCode =
  | "BROKEN_INTERNAL_LINK" | "INDEXING_BLOCKED" | "CANONICAL_MISMATCH"
  | "HTTP_ERROR" | "REDIRECT_MISSING" | "OVERSIZED_IMAGE"
  | "MOBILE_FUNCTION_BROKEN" | "CONTENT_NOT_RENDERED"
  | "MISLEADING_SCHEMA" | "MASS_PUBLICATION_RISK"
  | "SITEWIDE_CHANGE" | "HIGH_RISK_FACT_UNVERIFIED"
  | "METADATA_LENGTH" | "HEADING_STRUCTURE" | "SCHEMA_PARSE_ERROR"
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
  const reviewPassed = blocked.length === 0 && (!requiresHumanReview || input.humanApproved);
  return {
    // This checks only supplied observations and human-review signals.
    // It MUST NOT authorize publication without change-specific preflight,
    // actual URL verification, source review and an audited editor action.
    status: blocked.length ? "REVIEW_BLOCKED" as const :
      requiresHumanReview && !input.humanApproved ? "HUMAN_REVIEW_REQUIRED" as const :
      warnings.length ? "REVIEW_WARNINGS" as const : "REVIEW_PASSED" as const,
    reviewPassed,
    canPublish: false as const,
    publicationEligible: false as const,
    requiresChangeSpecificPreflight: true as const,
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
