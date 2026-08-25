export function propertyFeedbackActionLabel(action: "interested" | "not_for_me") {
  return action === "interested" ? "Interessant" : "Ikke for meg";
}
