import { buildCustomerProfileCompleteness, type BuyerCriterionInput, type Customer360ContactInput } from "@/lib/customer-360";

export type ReviewedDraftCriterion = BuyerCriterionInput & {
  approval_status: "pending" | "approved" | "rejected" | "edited";
  active?: boolean | null;
};

export type BuyerProfileDraftPromotionDecision = {
  canPromote: boolean;
  completeness: ReturnType<typeof buildCustomerProfileCompleteness>;
  pendingCount: number;
  editedActiveCount: number;
  rejectedActiveCount: number;
  reason: string;
};

export function decideBuyerProfileDraftPromotion(input: {
  contact: Customer360ContactInput;
  criteria: ReviewedDraftCriterion[];
}): BuyerProfileDraftPromotionDecision {
  const activeCriteria = input.criteria.filter((criterion) => criterion.active !== false);
  const pendingCount = activeCriteria.filter((criterion) => criterion.approval_status === "pending").length;
  const editedActiveCount = activeCriteria.filter((criterion) => criterion.approval_status === "edited").length;
  const rejectedActiveCount = activeCriteria.filter((criterion) => criterion.approval_status === "rejected").length;
  const approvedCriteria = activeCriteria.filter((criterion) => criterion.approval_status === "approved");
  const completeness = buildCustomerProfileCompleteness(input.contact, approvedCriteria);

  if (pendingCount > 0 || editedActiveCount > 0) {
    const unresolved = pendingCount + editedActiveCount;
    return {
      canPromote: false,
      completeness,
      pendingCount,
      editedActiveCount,
      rejectedActiveCount,
      reason: `${unresolved} active Buyer Profile criterion${unresolved === 1 ? " still requires" : "s still require"} explicit approval.`,
    };
  }

  if (rejectedActiveCount > 0) {
    return {
      canPromote: false,
      completeness,
      pendingCount,
      editedActiveCount,
      rejectedActiveCount,
      reason: "Rejected criteria cannot remain active before Buyer Profile promotion.",
    };
  }

  if (completeness.score !== 100 || completeness.missing.length > 0) {
    return {
      canPromote: false,
      completeness,
      pendingCount,
      editedActiveCount,
      rejectedActiveCount,
      reason: `Buyer Profile is ${completeness.score}% complete. Missing: ${completeness.missing.join(", ") || "unknown"}.`,
    };
  }

  return {
    canPromote: true,
    completeness,
    pendingCount,
    editedActiveCount,
    rejectedActiveCount,
    reason: "All active criteria are explicitly approved and Customer 360 completeness is 100%.",
  };
}
