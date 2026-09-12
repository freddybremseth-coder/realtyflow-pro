export type CustomerTasteEvidence = "insufficient" | "emerging" | "established";

export interface CustomerTasteLocationSignal {
  location: string;
  positive: number;
  negative: number;
  net: number;
  evidence: CustomerTasteEvidence;
}

export interface CustomerTasteProfileV1 {
  version: 1;
  generatedAt: string;
  feedbackEvents: number;
  positiveSignals: number;
  negativeSignals: number;
  viewingSignals: number;
  priceHighSignals: number;
  preferredLocations: CustomerTasteLocationSignal[];
  avoidedLocations: CustomerTasteLocationSignal[];
  priceSensitivity: "neutral" | "price_sensitive";
  safety: {
    secondaryRankingOnly: true;
    overridesExplicitBuyerCriteria: false;
    changesEligibility: false;
    maxAbsoluteAdjustment: 6;
  };
}

export interface CustomerTasteRankableProperty {
  score: number;
  eligibility: "eligible" | "conditional" | "rejected";
  property: {
    id: string;
    location: string | null;
    price: number | null;
  };
}

export type CustomerTasteRankedMatch<T extends CustomerTasteRankableProperty> = T & {
  tasteAdjustment: number;
  tasteAdjustedScore: number;
  tasteReasons: string[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function fold(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function evidenceForCount(count: number): CustomerTasteEvidence {
  if (count >= 4) return "established";
  if (count >= 2) return "emerging";
  return "insufficient";
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildCustomerTasteProfile(
  interactions: unknown[],
  now = new Date(),
): CustomerTasteProfileV1 {
  const locations = new Map<string, { location: string; positive: number; negative: number }>();
  let feedbackEvents = 0;
  let positiveSignals = 0;
  let negativeSignals = 0;
  let viewingSignals = 0;
  let priceHighSignals = 0;

  for (const value of interactions || []) {
    const interaction = asRecord(value);
    if (!interaction || fold(interaction.type) !== "property_feedback") continue;
    const metadata = asRecord(interaction.metadata);
    const signals = Array.isArray(metadata?.signals) ? metadata.signals : [];
    if (!signals.length) continue;
    feedbackEvents += 1;

    for (const rawSignal of signals) {
      const signal = asRecord(rawSignal);
      if (!signal) continue;
      const sentiment = fold(signal.sentiment);
      const location = text(signal.location);
      const reasons = Array.isArray(signal.reasons) ? signal.reasons.map(fold) : [];

      if (sentiment === "positive") positiveSignals += 1;
      if (sentiment === "negative") negativeSignals += 1;
      if (sentiment === "viewing") viewingSignals += 1;
      if (reasons.includes("price_high")) priceHighSignals += 1;

      if (!location) continue;
      const key = fold(location);
      const current = locations.get(key) || { location, positive: 0, negative: 0 };
      if (sentiment === "positive" || sentiment === "viewing") current.positive += 1;
      if (sentiment === "negative" && reasons.includes("location_dislike")) current.negative += 1;
      locations.set(key, current);
    }
  }

  const locationSignals = [...locations.values()]
    .map((item) => ({
      location: item.location,
      positive: item.positive,
      negative: item.negative,
      net: item.positive - item.negative,
      evidence: evidenceForCount(item.positive + item.negative),
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.positive + b.negative - (a.positive + a.negative));

  return {
    version: 1,
    generatedAt: now.toISOString(),
    feedbackEvents,
    positiveSignals,
    negativeSignals,
    viewingSignals,
    priceHighSignals,
    preferredLocations: locationSignals.filter((item) => item.net > 0 && item.evidence !== "insufficient").slice(0, 8),
    avoidedLocations: locationSignals.filter((item) => item.net < 0 && item.evidence !== "insufficient").slice(0, 8),
    priceSensitivity: priceHighSignals >= 2 ? "price_sensitive" : "neutral",
    safety: {
      secondaryRankingOnly: true,
      overridesExplicitBuyerCriteria: false,
      changesEligibility: false,
      maxAbsoluteAdjustment: 6,
    },
  };
}

function locationStrength(signal: CustomerTasteLocationSignal) {
  const count = signal.positive + signal.negative;
  if (signal.evidence === "established") return Math.min(4, 2.5 + count * 0.3);
  if (signal.evidence === "emerging") return Math.min(2.5, 1.5 + count * 0.25);
  return 0;
}

function eligibilityBand(value: CustomerTasteRankableProperty["eligibility"]) {
  if (value === "eligible") return 0;
  if (value === "conditional") return 1;
  return 2;
}

export function rankMatchesWithCustomerTaste<T extends CustomerTasteRankableProperty>(
  matches: T[],
  profile: CustomerTasteProfileV1 | null | undefined,
  options: { budgetAmount?: number | null } = {},
): Array<CustomerTasteRankedMatch<T>> {
  if (!profile || profile.feedbackEvents < 2) {
    return matches.map((match) => ({
      ...match,
      tasteAdjustment: 0,
      tasteAdjustedScore: match.score,
      tasteReasons: [],
    }));
  }

  const budget = typeof options.budgetAmount === "number" && options.budgetAmount > 0
    ? options.budgetAmount
    : null;

  const ranked = matches.map((match) => {
    let adjustment = 0;
    const reasons: string[] = [];
    const location = fold(match.property.location);

    if (location) {
      const preferred = profile.preferredLocations.find((item) => fold(item.location) === location);
      if (preferred) {
        const bonus = locationStrength(preferred);
        adjustment += bonus;
        reasons.push(`Observerte kundesignaler favoriserer ${preferred.location}.`);
      }
      const avoided = profile.avoidedLocations.find((item) => fold(item.location) === location);
      if (avoided) {
        const penalty = Math.min(5, locationStrength(avoided) + 0.5);
        adjustment -= penalty;
        reasons.push(`Observerte kundesignaler viser lavere interesse for ${avoided.location}.`);
      }
    }

    if (profile.priceSensitivity === "price_sensitive" && budget && typeof match.property.price === "number") {
      const ratio = match.property.price / budget;
      if (ratio <= 0.85) {
        adjustment += 1.25;
        reasons.push("Tidligere feedback tyder på prisfølsomhet; denne ligger godt under registrert budsjett.");
      } else if (ratio >= 0.98) {
        adjustment -= 1.25;
        reasons.push("Tidligere feedback tyder på prisfølsomhet; denne ligger nær registrert budsjettgrense.");
      }
    }

    adjustment = Math.max(-profile.safety.maxAbsoluteAdjustment, Math.min(profile.safety.maxAbsoluteAdjustment, adjustment));
    const adjusted = Math.max(0, Math.min(100, match.score + adjustment));
    return {
      ...match,
      tasteAdjustment: rounded(adjustment),
      tasteAdjustedScore: rounded(adjusted),
      tasteReasons: reasons.slice(0, 4),
    };
  });

  return ranked.sort((a, b) =>
    eligibilityBand(a.eligibility) - eligibilityBand(b.eligibility)
    || b.tasteAdjustedScore - a.tasteAdjustedScore
    || b.score - a.score
    || a.property.id.localeCompare(b.property.id),
  );
}
