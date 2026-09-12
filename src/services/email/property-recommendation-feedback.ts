import { extractLatestReplyText } from "@/lib/inbound-reply-intelligence";
import { buildLeadCustomerPresentationPreview } from "@/services/lead-intelligence/presentation-preview";

export type PropertyFeedbackSentiment = "positive" | "negative" | "question" | "viewing" | "neutral";

export interface PropertyRecommendationFeedbackItem {
  propertyId: string | null;
  reference: string | null;
  title: string;
  location: string | null;
  ordinal: number;
  sentiment: PropertyFeedbackSentiment;
  confidence: number;
  signals: string[];
  sourceText: string;
}

export interface PropertyRecommendationFeedbackResult {
  propertyFeedback: PropertyRecommendationFeedbackItem[];
  buyerProfileSuggestions: Array<{
    kind: "budget" | "location" | "property_type" | "size" | "other";
    value: string;
    confidence: number;
    autoApply: false;
    reason: string;
  }>;
  requiresHumanReview: boolean;
}

function normalize(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }

function sentimentFor(text: string) {
  const normalized = normalize(text);
  const viewing = /\b(visning|se boligen|se denne|kan vi se|vil vi gjerne se|vil jeg gjerne se|gjerne se|booke|book a viewing|viewing|see this|see the property|want to see|would like to see)\b/i.test(normalized);
  if (viewing) return { sentiment: "viewing" as const, confidence: 0.98, signal: "viewing_intent" };
  const negative = /\b(for dyr|for expensive|too expensive|dyrere enn|liker ikke|ikke interessert|not interested|dont like|don't like|passer ikke|doesn't fit|does not fit|feil omrade|wrong area|for langt|too far|for liten|too small|for stor|too big)\b/i.test(normalized);
  if (negative) return { sentiment: "negative" as const, confidence: 0.94, signal: "explicit_negative" };
  const positive = /\b(liker|liker best|interessant|interessert|ser bra ut|fin|denne liker vi|denne liker jeg|like|love|interesting|interested|looks good|our favorite|favourite|favorite)\b/i.test(normalized);
  if (positive) return { sentiment: "positive" as const, confidence: 0.92, signal: "explicit_positive" };
  const question = /\?|\b(hva|kan du|er den|how|can you|is it|available|tilgjengelig)\b/i.test(normalized);
  if (question) return { sentiment: "question" as const, confidence: 0.82, signal: "property_question" };
  return { sentiment: "neutral" as const, confidence: 0.55, signal: "property_mentioned" };
}

function clauses(text: string) {
  return text.split(/(?:\n+|[.!?;]+|\bmen\b|\bbut\b)/i).map((part) => part.trim()).filter(Boolean);
}

function propertyMentioned(clause: string, input: { ordinal: number; reference: string | null; title: string; location: string | null }) {
  const n = normalize(clause);
  const ordinalPatterns = [
    new RegExp(`\\b(?:nr\\.?|nummer|number|no\\.?)\\s*${input.ordinal}\\b`, "i"),
    new RegExp(`^\\s*${input.ordinal}\\s*[:.)-]`, "i"),
    new RegExp(`\\bbolig\\s*${input.ordinal}\\b`, "i"),
    new RegExp(`\\bproperty\\s*${input.ordinal}\\b`, "i"),
  ];
  if (ordinalPatterns.some((pattern) => pattern.test(clause))) return true;
  if (input.reference && n.includes(normalize(input.reference))) return true;
  if (input.title && normalize(input.title).length >= 5 && n.includes(normalize(input.title))) return true;
  return false;
}

function profileSuggestions(text: string) {
  const normalized = normalize(text);
  const suggestions: PropertyRecommendationFeedbackResult["buyerProfileSuggestions"] = [];
  const tooExpensive = /\b(for dyr|too expensive|dyrere enn budsjett|over budget)\b/i.test(normalized);
  if (tooExpensive) suggestions.push({ kind: "budget", value: "Customer indicates one or more recommendations are too expensive.", confidence: 0.88, autoApply: false, reason: "Property-level price feedback may imply a tighter budget, but exact budget must be confirmed before changing Buyer Profile." });
  const dislikeArea = /\b(liker ikke omradet|liker ikke området|dont like the area|don't like the area|wrong area|feil omrade|feil område)\b/i.test(normalized);
  if (dislikeArea) suggestions.push({ kind: "location", value: "Customer expresses negative feedback about an area.", confidence: 0.9, autoApply: false, reason: "Area feedback is commercially useful but must not silently become a permanent exclusion without clear scope." });
  const tooSmall = /\b(for liten|too small|trenger storre|trenger større|need bigger|more bedrooms|flere soverom)\b/i.test(normalized);
  if (tooSmall) suggestions.push({ kind: "size", value: "Customer indicates the property is too small or needs more space.", confidence: 0.9, autoApply: false, reason: "Size feedback suggests a criteria change, but the exact new minimum must be confirmed." });
  return suggestions;
}

export function extractPropertyRecommendationFeedback(input: { body?: string | null; presentationJson: unknown }): PropertyRecommendationFeedbackResult {
  const latest = extractLatestReplyText(input.body);
  const preview = buildLeadCustomerPresentationPreview(input.presentationJson);
  const parts = clauses(latest);
  const propertyFeedback: PropertyRecommendationFeedbackItem[] = [];

  preview.properties.forEach((property, index) => {
    const ordinal = index + 1;
    const matching = parts.filter((part) => propertyMentioned(part, { ordinal, reference: property.reference, title: property.title, location: property.location }));
    if (!matching.length) return;
    const combined = matching.join(". ");
    const result = sentimentFor(combined);
    const signals = [result.signal];
    const normalized = normalize(combined);
    if (/\b(for dyr|too expensive|over budget)\b/i.test(normalized)) signals.push("price_too_high");
    if (/\b(liker ikke omradet|dont like the area|don't like the area|wrong area|feil omrade)\b/i.test(normalized)) signals.push("location_negative");
    if (/\b(for liten|too small|flere soverom|more bedrooms)\b/i.test(normalized)) signals.push("size_negative");
    propertyFeedback.push({ propertyId: property.propertyId, reference: property.reference, title: property.title, location: property.location, ordinal, sentiment: result.sentiment, confidence: result.confidence, signals: unique(signals), sourceText: combined.slice(0, 800) });
  });

  const buyerProfileSuggestions = profileSuggestions(latest);
  return {
    propertyFeedback,
    buyerProfileSuggestions,
    requiresHumanReview: buyerProfileSuggestions.length > 0 || propertyFeedback.some((item) => item.sentiment === "neutral"),
  };
}
