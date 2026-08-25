export const ADVISOR_MAIL_FEEDBACK_POLICY_V2 = {
  customerActions: ["Interessant", "Ikke for meg"],
  interested: "increase_property_relevance_and_surface_for_advisor_followup",
  notForMe: "reduce_similar_property_relevance_without_guessing_reason",
  inferReasonWithoutExplicitFeedback: false,
  autonomousFollowupFromSingleClick: false,
} as const;
