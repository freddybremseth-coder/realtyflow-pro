import type { EmailIdentityReviewAssessment } from "./email-link-health";

export interface EmailIdentityReviewPrioritySummary {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export function summarizeEmailIdentityReviewPriorities(
  reviews: EmailIdentityReviewAssessment[],
): EmailIdentityReviewPrioritySummary {
  const summary: EmailIdentityReviewPrioritySummary = { high: 0, medium: 0, low: 0, total: 0 };

  for (const review of reviews || []) {
    if (review.priority === "high") summary.high += 1;
    else if (review.priority === "medium") summary.medium += 1;
    else summary.low += 1;
    summary.total += 1;
  }

  return summary;
}
