export type TodayDestinationType =
  | "action"
  | "followup"
  | "learning_review"
  | "goal"
  | "business_opportunity"
  | "publishing_attention"
  | "prediction_attention";

export function todayDestination(type: TodayDestinationType): string {
  switch (type) {
    case "learning_review":
      return "/personal-intelligence/learn";
    case "prediction_attention":
      return "/personal-intelligence/predictions";
    case "business_opportunity":
      return "/nexus-os/today";
    case "publishing_attention":
      return "/books";
    case "action":
    case "followup":
    case "goal":
    default:
      return "/personal-intelligence/commitments";
  }
}
