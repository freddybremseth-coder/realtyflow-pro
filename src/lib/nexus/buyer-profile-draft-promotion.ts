import { buildCustomerProfileCompleteness, type BuyerCriterionInput, type Customer360ContactInput } from "@/lib/customer-360";

export type ReviewedDraftCriterion = BuyerCriterionInput & {
  approval_status: "pending" | "approved" | "rejected" | "edited";
  active?: boolean | null;
};

export type BuyerProfileDraftPromotionDecision = {
  canPromote: boolean;
  completeness: ReturnType<typeof buildCustomerProfileCompleteness>;
  pendingCount: number;
  rejectedActiveCount: number;
  reason: string;
};

export function decideBuyerProfileDraftPromotion(input: {
  contact: Customer360ContactInput;
  criteria: ReviewedDraftCriterion[];
}): BuyerProfileDraftPromotionDecision {
  const activeCriteria = input.criteria.filter((criterion) => criterion.active !== false);
  const pendingCount = activeCriteria.filter((criterion) => criterion.approval_status === "pending").length;
  const rejectedActiveCount = activeCriteria.filter((criterion) => criterion.approval_status === "rejected").length;
  const approvedCriteria = activeCriteria.filter((criterion) =>
    criterion.approval_status === "approved" || criterion.approval_status === "edited",
  );
  const completeness = buildCustomerProfileCompleteness(input.contact, approvedCriteria);

  if (pendingCount > 0) {
    return {
      canPromote: false,
      completeness,
      pendingCount,
      rejectedActiveCount,
      reason: `${pendingCount} active Buyer Profile criterion${pendingCount === 1 ? " is" : " are"} still pending review.`,
    };
  }

  if (rejectedActiveCount > 0) {
    return {
      canPromote: false,
      completeness,
      pendingCount,
      rejectedActiveCount,
      reason: "Rejected criteria cannot remain active before Buyer Profile promotion.",
    };
  }

  if (completeness.score !== 100 || completeness.missing.length > 0) {
    return {
      canPromote: false,
      completeness,
      pendingCount,
      rejectedActiveCount,
      reason: `Buyer Profile is ${completeness.score}% complete. Missing: ${completeness.missing.join(", ") || "unknown"}.`,
    };
  }

  return {
    canPromote: true,
    completeness,
    pendingCount,
    rejectedActiveCount,
    reason: "All active criteria are reviewed and Customer 360 completeness is 100%.",
  };
}
