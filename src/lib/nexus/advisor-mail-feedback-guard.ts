export function isAdvisorMailFeedbackAction(value: string): value is "interested" | "not_for_me" {
  return value === "interested" || value === "not_for_me";
}
