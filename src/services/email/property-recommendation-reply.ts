import { extractLatestReplyText } from "@/lib/inbound-reply-intelligence";
import type { LeadCustomerPresentationPreviewProperty } from "@/services/lead-intelligence/presentation-preview";

export type PropertyFeedbackSentiment = "positive" | "negative" | "viewing" | "question";
export type PropertyFeedbackReason =
  | "price_high"
  | "price_good"
  | "location_dislike"
  | "location_like"
  | "too_small"
  | "too_large"
  | "style_dislike"
  | "style_like"
  | "viewing_requested"
  | "more_information"
  | "other";

export interface PropertyFeedbackSignal {
  propertyId: string | null;
  reference: string | null;
  title: string;
  location: string | null;
  ordinal: number;
  sentiment: PropertyFeedbackSentiment;
  reasons: PropertyFeedbackReason[];
  evidence: string;
  confidence: number;
}

export interface PropertyRecommendationReplyAnalysis {
  latestReply: string;
  signals: PropertyFeedbackSignal[];
  explicitCriteriaEvidence: string[];
  shouldRematch: boolean;
  requiresBuyerProfileReview: boolean;
  highIntent: boolean;
}

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunks(value: string) {
  return value
    .split(/(?:\n+|(?<=[.!?])\s+|\s*[;•]\s*)/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function referencedOrdinals(text: string, max: number) {
  const found = new Set<number>();
  const patterns = [
    /(?:nr\.?|nummer|no\.?|number|#)\s*(\d{1,2})\b/gi,
    /\b(?:bolig|property|alternativ|option)\s*(\d{1,2})\b/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value >= 1 && value <= max) found.add(value);
    }
  }
  return [...found];
}

function referencesForChunk(chunk: string, properties: LeadCustomerPresentationPreviewProperty[]) {
  const normalized = normalize(chunk);
  const found = new Set<number>(referencedOrdinals(chunk, properties.length));
  properties.forEach((property, index) => {
    const reference = normalize(property.reference);
    const title = normalize(property.title);
    const location = normalize(property.location);
    if (reference && normalized.includes(reference)) found.add(index + 1);
    else if (title && title.length >= 8 && normalized.includes(title)) found.add(index + 1);
    else if (location && location.length >= 4 && normalized.includes(location) && /(?:den|denne|bolig|property|villa|leilighet|apartment|omrade|area)/i.test(chunk)) found.add(index + 1);
  });
  return [...found].sort((a, b) => a - b);
}

function sentimentForChunk(chunk: string): { sentiment: PropertyFeedbackSentiment | null; reasons: PropertyFeedbackReason[]; confidence: number } {
  const text = normalize(chunk);
  const viewing = /\b(visning|se boligen|se denne|kan vi se|booke|viewing|view it|see the property|see this one)\b/i.test(text);
  if (viewing) return { sentiment: "viewing", reasons: ["viewing_requested"], confidence: 0.98 };

  const reasons: PropertyFeedbackReason[] = [];
  if (/\b(for dyr|for kostbar|over budsjett|too expensive|too pricey|above budget)\b/i.test(text)) reasons.push("price_high");
  if (/\b(god pris|fin pris|innenfor budsjett|good price|within budget)\b/i.test(text)) reasons.push("price_good");
  if (/\b(liker ikke omrad(?:e|et)?|ikke omrad(?:e|et)?|feil omrad(?:e|et)?|wrong area|don't like the area|do not like the area|location is not for us)\b/i.test(text)) reasons.push("location_dislike");
  if (/\b(liker omrad(?:e|et)?|bra omrad(?:e|et)?|riktig omrad(?:e|et)?|like the area|good location|great location)\b/i.test(text)) reasons.push("location_like");
  if (/\b(for liten|for sma|too small|not enough space)\b/i.test(text)) reasons.push("too_small");
  if (/\b(for stor|too large|too big)\b/i.test(text)) reasons.push("too_large");
  if (/\b(liker ikke stilen|ikke min stil|for moderne|for tradisjonell|don't like the style|not my style)\b/i.test(text)) reasons.push("style_dislike");
  if (/\b(liker stilen|fin stil|love the style|like the style)\b/i.test(text)) reasons.push("style_like");
  if (/\b(mer info|mer informasjon|flere bilder|more info|more information|more photos|details)\b/i.test(text)) reasons.push("more_information");

  const negative = /\b(ikke interess|ikke aktuell|liker ikke|passer ikke|nei|for dyr|for liten|for stor|not interested|don't like|do not like|not for us|too expensive|too small|too big)\b/i.test(text);
  const positive = /\b(interessant|interessert|liker|aktuell|ser bra ut|denne liker|favoritt|interesting|interested|like this|looks good|favourite|favorite)\b/i.test(text);
  const question = /\?|\b(kan du sende|kan du sjekke|hva koster|er den ledig|is it available|can you send|can you check)\b/i.test(text);

  if (negative) return { sentiment: "negative", reasons: reasons.length ? reasons : ["other"], confidence: reasons.length ? 0.97 : 0.91 };
  if (positive) return { sentiment: "positive", reasons: reasons.length ? reasons : ["other"], confidence: reasons.length ? 0.96 : 0.92 };
  if (question || reasons.includes("more_information")) return { sentiment: "question", reasons: reasons.length ? reasons : ["more_information"], confidence: 0.9 };
  return { sentiment: null, reasons: [], confidence: 0 };
}

function canCarryForwardReference(chunk: string, sentiment: PropertyFeedbackSentiment | null) {
  if (sentiment !== "viewing" && sentiment !== "question") return false;
  const text = normalize(chunk);
  return /\b(den|denne|boligen|eiendommen|property|it|this one|that one)\b/i.test(text)
    || /\b(kan vi se|se boligen|se denne|view it|see the property|see this one)\b/i.test(text);
}

function explicitCriteriaEvidence(text: string) {
  const evidence: string[] = [];
  const patterns = [
    /\b(?:maks|max|maximum|budsjett|budget)\s*(?:er|på|of|is|:)?\s*€?\s*([0-9][0-9 .]{3,})\b/i,
    /\b(?:minst|minimum|at least)\s*(\d+)\s*(?:soverom|bedrooms?)\b/i,
    /\b(?:heller|foretrekker|prefer(?:s|red)?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,40})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) evidence.push(match[0].trim());
  }
  return [...new Set(evidence)].slice(0, 6);
}

export function analyzePropertyRecommendationReply(input: {
  body?: string | null;
  subject?: string | null;
  properties: LeadCustomerPresentationPreviewProperty[];
}): PropertyRecommendationReplyAnalysis {
  const latestReply = extractLatestReplyText(input.body) || String(input.subject || "").trim();
  const properties = input.properties || [];
  const signals: PropertyFeedbackSignal[] = [];
  let lastExplicitRefs: number[] = [];

  for (const chunk of chunks(latestReply)) {
    const explicitRefs = referencesForChunk(chunk, properties);
    const assessment = sentimentForChunk(chunk);
    if (!assessment.sentiment) {
      if (explicitRefs.length) lastExplicitRefs = explicitRefs;
      continue;
    }

    const refs = explicitRefs.length
      ? explicitRefs
      : lastExplicitRefs.length === 1 && canCarryForwardReference(chunk, assessment.sentiment)
        ? lastExplicitRefs
        : [];
    if (!refs.length) continue;
    if (explicitRefs.length) lastExplicitRefs = explicitRefs;

    for (const ordinal of refs) {
      const property = properties[ordinal - 1];
      if (!property) continue;
      signals.push({
        propertyId: property.propertyId,
        reference: property.reference,
        title: property.title,
        location: property.location,
        ordinal,
        sentiment: assessment.sentiment,
        reasons: assessment.reasons,
        evidence: chunk.slice(0, 500),
        confidence: explicitRefs.length ? assessment.confidence : Math.min(0.95, assessment.confidence),
      });
    }
  }

  const deduped = [...new Map(signals.map((signal) => [`${signal.ordinal}:${signal.sentiment}:${signal.reasons.join(",")}`, signal])).values()];
  const criteria = explicitCriteriaEvidence(latestReply);
  const hasNegative = deduped.some((signal) => signal.sentiment === "negative");
  const hasPositive = deduped.some((signal) => signal.sentiment === "positive");
  const highIntent = deduped.some((signal) => signal.sentiment === "viewing") || (hasPositive && deduped.some((signal) => signal.reasons.includes("more_information")));
  const preferenceReason = deduped.some((signal) => signal.reasons.some((reason) => ["price_high", "location_dislike", "too_small", "too_large", "style_dislike"].includes(reason)));

  return {
    latestReply,
    signals: deduped.slice(0, 12),
    explicitCriteriaEvidence: criteria,
    shouldRematch: hasNegative || criteria.length > 0,
    requiresBuyerProfileReview: preferenceReason || criteria.length > 0,
    highIntent,
  };
}
