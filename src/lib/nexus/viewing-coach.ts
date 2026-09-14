export type ViewingCoachSentiment = "positive" | "negative" | "mixed" | "neutral";
export type ViewingCoachReason =
  | "price_high"
  | "price_good"
  | "location_dislike"
  | "location_like"
  | "too_small"
  | "too_large"
  | "style_dislike"
  | "style_like";

export interface ViewingCoachTasteSignal {
  propertyId: string | null;
  reference: string | null;
  title: string;
  location: string | null;
  sentiment: "positive" | "negative";
  reasons: ViewingCoachReason[];
  evidence: string;
  confidence: number;
}

export interface ViewingCoachPlan {
  version: 1;
  sentiment: ViewingCoachSentiment;
  reasons: ViewingCoachReason[];
  explicitCriteriaEvidence: string[];
  highIntent: boolean;
  shouldRematch: boolean;
  requiresBuyerProfileReview: boolean;
  tasteSignal: ViewingCoachTasteSignal | null;
  nextAction: string;
  safety: {
    buyerProfileMutation: false;
    pipelineMutation: false;
    customerSend: false;
    secondaryRankingOnly: true;
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function fold(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function explicitCriteriaEvidence(note: string) {
  const evidence: string[] = [];
  const patterns = [
    /\b(?:maks|max|maximum|budsjett|budget)\s*(?:er|på|of|is|:)?\s*€?\s*[0-9][0-9 .]{3,}\b/i,
    /\b(?:minst|minimum|at least|må ha|must have)\b.{0,50}\b\d+\s*(?:soverom|bedrooms?)\b/i,
    /\b(?:kun|bare|only)\s+(?:i|in)\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,40}/i,
    /\b(?:må være|must be|vil kun ha|only want)\b.{0,70}/i,
  ];
  for (const pattern of patterns) {
    const match = note.match(pattern);
    if (match?.[0]) evidence.push(match[0].trim());
  }
  return unique(evidence).slice(0, 6);
}

function reasonsFor(note: string): ViewingCoachReason[] {
  const normalized = fold(note);
  const reasons: ViewingCoachReason[] = [];
  if (/\b(for dyr|for kostbar|over budsjett|too expensive|too pricey|above budget)\b/i.test(normalized)) reasons.push("price_high");
  if (/\b(god pris|fin pris|innenfor budsjett|good price|within budget)\b/i.test(normalized)) reasons.push("price_good");
  if (/\b((?:liker|likte) ikke omrad(?:e|et)?|feil omrad(?:e|et)?|wrong area|don't like the area|do not like the area|location is not for us)\b/i.test(normalized)) reasons.push("location_dislike");
  if (/\b((?:liker|likte) omrad(?:e|et)?|bra omrad(?:e|et)?|riktig omrad(?:e|et)?|like the area|liked the area|good location|great location)\b/i.test(normalized)) reasons.push("location_like");
  if (/\b(for liten|for sma|too small|not enough space)\b/i.test(normalized)) reasons.push("too_small");
  if (/\b(for stor|too large|too big)\b/i.test(normalized)) reasons.push("too_large");
  if (/\b((?:liker|likte) ikke stilen|ikke min stil|for moderne|for tradisjonell|don't like the style|didn't like the style|did not like the style|not my style)\b/i.test(normalized)) reasons.push("style_dislike");
  if (/\b((?:liker|likte) stilen|fin stil|elsker stilen|love the style|liked the style|like the style)\b/i.test(normalized)) reasons.push("style_like");
  return unique(reasons);
}

export function buildViewingCoachPlan(input: {
  note?: string | null;
  propertyId?: string | null;
  propertyReference?: string | null;
  propertyTitle?: string | null;
  propertyLocation?: string | null;
}): ViewingCoachPlan {
  const note = text(input.note);
  const normalized = fold(note);
  const reasons = reasonsFor(note);
  const negativePhrase = /\b(likte ikke|liker ikke|ikke for oss|passer ikke|skuffet|nei|not for us|didn't like|did not like|don't like|do not like|disappointed)\b/i.test(normalized);
  const positiveText = normalized.replace(/\b(likte ikke|liker ikke|didn't like|did not like|don't like|do not like)\b/gi, "");
  const positive = /\b(likte|liker|elsket|elsker|veldig bra|perfekt|favoritt|interessert|ser bra ut|liked|love|loved|great|perfect|favourite|favorite|interested)\b/i.test(positiveText)
    || reasons.some((reason) => ["price_good", "location_like", "style_like"].includes(reason));
  const negative = negativePhrase
    || reasons.some((reason) => ["price_high", "location_dislike", "too_small", "too_large", "style_dislike"].includes(reason));
  const sentiment: ViewingCoachSentiment = positive && negative ? "mixed" : positive ? "positive" : negative ? "negative" : "neutral";
  const highIntent = /\b(vil kjøpe|vil kjope|ønsker a kjøpe|ønsker å kjøpe|ga videre|gå videre|legge inn bud|gi bud|kjøpe denne|ready to buy|want to buy|make an offer|move forward|proceed)\b/i.test(normalized);
  const explicitCriteria = explicitCriteriaEvidence(note);
  const requiresBuyerProfileReview = explicitCriteria.length > 0;
  const shouldRematch = !highIntent && (sentiment === "negative" || sentiment === "mixed");

  const propertyTitle = text(input.propertyTitle) || text(input.propertyReference) || "Visningsboligen";
  const tasteSignal = note && sentiment !== "neutral"
    ? {
        propertyId: text(input.propertyId) || null,
        reference: text(input.propertyReference) || null,
        title: propertyTitle,
        location: text(input.propertyLocation) || null,
        sentiment: negative ? "negative" as const : "positive" as const,
        reasons,
        evidence: note.slice(0, 700),
        confidence: reasons.length ? 0.96 : 0.88,
      }
    : null;

  let nextAction: string;
  if (highIntent) {
    nextAction = "Sterk kjøpsintensjon etter bekreftet visning. Gjennomgå feedback og vurder neste steg mot NEGOTIATION; Nexus flytter ikke pipeline og sender ingenting automatisk.";
  } else if (requiresBuyerProfileReview) {
    nextAction = "Kunden uttrykker mulig endring i eksplisitte søkekriterier. Gjennomgå Buyer Profile før ny matching; kriteriene endres ikke automatisk.";
  } else if (shouldRematch) {
    nextAction = "Bruk visningsfeedbacken som sekundært smakssignal og rerank neste matching med godkjent Buyer Profile uendret. Kontroller nye treff før eventuell kundekontakt.";
  } else if (sentiment === "positive") {
    nextAction = "Positiv visningsfeedback. Følg opp interesse og avklar konkret neste steg; Nexus gjør ingen pris-, pipeline- eller kundekommunikasjonsforpliktelse automatisk.";
  } else {
    nextAction = "Visningen er bekreftet fullført, men konkret kundefeedback mangler. Registrer hva kunden likte, mislikte eller reagerte på før neste anbefaling.";
  }

  return {
    version: 1,
    sentiment,
    reasons,
    explicitCriteriaEvidence: explicitCriteria,
    highIntent,
    shouldRematch,
    requiresBuyerProfileReview,
    tasteSignal,
    nextAction,
    safety: {
      buyerProfileMutation: false,
      pipelineMutation: false,
      customerSend: false,
      secondaryRankingOnly: true,
    },
  };
}
