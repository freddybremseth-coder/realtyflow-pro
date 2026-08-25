export function advisorMailFeedbackLeadScoreDelta(action: "interested" | "not_for_me") {
  return action === "interested" ? 12 : 0;
}
