export const PROPERTY_FEEDBACK_REASONS = [
  "price",
  "area",
  "property_type",
  "size",
  "distance",
  "view",
  "condition",
  "other",
] as const;

export type PropertyFeedbackReason = (typeof PROPERTY_FEEDBACK_REASONS)[number];

export const PROPERTY_FEEDBACK_REASON_LABELS: Record<PropertyFeedbackReason, string> = {
  price: "Pris",
  area: "Område",
  property_type: "Boligtype",
  size: "Størrelse",
  distance: "Avstand / beliggenhet",
  view: "Utsikt / orientering",
  condition: "Standard / tilstand",
  other: "Annet",
};
