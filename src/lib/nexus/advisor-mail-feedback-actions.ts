export const PROPERTY_FEEDBACK_ACTIONS = ["interested", "not_for_me"] as const;
export type PropertyFeedbackAction = (typeof PROPERTY_FEEDBACK_ACTIONS)[number];
