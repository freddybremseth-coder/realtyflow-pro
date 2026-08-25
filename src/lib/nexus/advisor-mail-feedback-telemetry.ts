export type AdvisorMailFeedbackTelemetryAction = "interested" | "not_for_me";

export function feedbackTelemetryName(action: AdvisorMailFeedbackTelemetryAction) {
  return action === "interested" ? "advisor_mail.property_interested" : "advisor_mail.property_not_for_me";
}
