type FeedbackRow = {
  action?: string | null;
  property_id?: string | null;
  created_at?: string | null;
};

export type MatchableProperty = {
  id?: string | null;
  ref?: string | null;
  location?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  price?: number | null;
  title_no?: string | null;
  title_en?: string | null;
  title_es?: string | null;
};

export type LearnedPropertyProfile = {
  preferredLocations: string[];
  preferredBedrooms: number | null;
  preferredBathrooms: number | null;
  preferredPrice: number | null;
  minBedroomsFromConversation: number | null;
  maxBudgetFromConversation: number | null;
  evidenceCount: number;
  confidence: "high" | "medium" | "low";
};

export type PropertyMatchV2 = {
  score: number;
  label: "STRONG" | "GOOD" | "POSSIBLE" | "WEAK";
  reasons: string[];
  cautions: string[];
  profile: LearnedPropertyProfile;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mode(values: number[]) {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

function compactLocation(value: string | null | undefined) {
  const normalized = normalize(value);
  if (!normalized) return null;
  return normalized.split(",")[0]?.trim() || normalized;
}

function parseMinBedrooms(text: string) {
  const patterns = [
    /(?:min(?:imum)?|minst|minimum|at least)\s*(\d+)\s*(?:soverom|bedrooms?|beds?)/i,
    /(\d+)\s*(?:soverom|bedrooms?|beds?)\s*(?:minimum|minst|min)/i,
    /(?:minimum|minimo|mínimo)\s*(?:de\s*)?(\d+)\s*(?:dormitorios?|habitaciones?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function parseMaxBudget(text: string) {
  const cleaned = text.replace(/\s/g, "");
  const patterns = [
    /(?:budget|budsjett|maks|max|maximum|hasta|precio)[^\d€]{0,20}€?(\d{3,7})(?:[.,](\d{3}))?/i,
    /€(\d{3,7})(?:[.,](\d{3}))?/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1]) continue;
    const base = Number(match[1]);
    const tail = match[2] ? Number(match[2]) : 0;
    const value = tail && base < 10000 ? base * 1000 + tail : base;
    if (value >= 50000 && value <= 10000000) return value;
  }
  return null;
}

export function learnPropertyProfile(input: {
  feedback: FeedbackRow[];
  propertiesById: Map<string, MatchableProperty>;
  conversationText?: string;
}): LearnedPropertyProfile {
  const latestByProperty = new Map<string, FeedbackRow>();
  for (const row of input.feedback) {
    const id = String(row.property_id || "");
    if (!id) continue;
    const current = latestByProperty.get(id);
    if (!current || String(row.created_at || "") > String(current.created_at || "")) latestByProperty.set(id, row);
  }

  const interested = [...latestByProperty.entries()]
    .filter(([, row]) => row.action === "interested")
    .map(([id]) => input.propertiesById.get(id))
    .filter(Boolean) as MatchableProperty[];

  const locationCounts = new Map<string, number>();
  for (const property of interested) {
    const location = compactLocation(property.location);
    if (location) locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
  }

  const preferredLocations = [...locationCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([location]) => location);

  const bedrooms = interested.map((p) => Number(p.bedrooms)).filter((v) => Number.isFinite(v) && v > 0);
  const bathrooms = interested.map((p) => Number(p.bathrooms)).filter((v) => Number.isFinite(v) && v > 0);
  const prices = interested.map((p) => Number(p.price)).filter((v) => Number.isFinite(v) && v > 0);
  const conversationText = String(input.conversationText || "");
  const minBedroomsFromConversation = parseMinBedrooms(conversationText);
  const maxBudgetFromConversation = parseMaxBudget(conversationText);
  const explicitSignals = Number(minBedroomsFromConversation != null) + Number(maxBudgetFromConversation != null);
  const evidenceCount = interested.length + explicitSignals;

  return {
    preferredLocations,
    preferredBedrooms: mode(bedrooms),
    preferredBathrooms: mode(bathrooms),
    preferredPrice: median(prices),
    minBedroomsFromConversation,
    maxBudgetFromConversation,
    evidenceCount,
    confidence: evidenceCount >= 4 ? "high" : evidenceCount >= 2 ? "medium" : "low",
  };
}

export function scorePropertyV2(input: {
  property: MatchableProperty;
  feedback: FeedbackRow[];
  propertiesById: Map<string, MatchableProperty>;
  conversationText?: string;
  aiMatched?: boolean;
}): PropertyMatchV2 {
  const property = input.property;
  const profile = learnPropertyProfile({ feedback: input.feedback, propertiesById: input.propertiesById, conversationText: input.conversationText });
  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = input.aiMatched === false ? 20 : 35;
  if (input.aiMatched !== false) reasons.push("Aktuell AI-match fra kundedialogen");

  const propertyId = String(property.id || "");
  const latestFeedback = input.feedback
    .filter((row) => String(row.property_id || "") === propertyId)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  if (latestFeedback?.action === "not_for_me") {
    return { score: 0, label: "WEAK", reasons, cautions: ["Kunden har eksplisitt markert denne boligen som ikke for meg"], profile };
  }
  if (latestFeedback?.action === "interested") {
    score += 25;
    reasons.push("Kunden har tidligere markert denne boligen som interessant");
  }

  const location = compactLocation(property.location);
  if (location && profile.preferredLocations.includes(location)) {
    score += 18;
    reasons.push(`Område samsvarer med tidligere interesse: ${property.location}`);
  }

  const beds = Number(property.bedrooms || 0);
  if (profile.minBedroomsFromConversation != null) {
    if (beds >= profile.minBedroomsFromConversation) {
      score += 12;
      reasons.push(`Oppfyller uttrykt minimum på ${profile.minBedroomsFromConversation} soverom`);
    } else {
      score -= 35;
      cautions.push(`Har ${beds || "ukjent antall"} soverom, under uttrykt minimum ${profile.minBedroomsFromConversation}`);
    }
  } else if (profile.preferredBedrooms != null && beds) {
    const diff = Math.abs(beds - profile.preferredBedrooms);
    if (diff === 0) {
      score += 10;
      reasons.push(`${beds} soverom samsvarer med tidligere interesserte boliger`);
    } else if (diff === 1) score += 4;
  }

  const baths = Number(property.bathrooms || 0);
  if (profile.preferredBathrooms != null && baths) {
    if (baths === profile.preferredBathrooms) {
      score += 6;
      reasons.push(`${baths} bad samsvarer med tidligere interesserte boliger`);
    }
  }

  const price = Number(property.price || 0);
  if (profile.maxBudgetFromConversation != null && price) {
    if (price <= profile.maxBudgetFromConversation) {
      score += 14;
      reasons.push("Pris er innenfor uttrykt budsjett");
    } else if (price <= profile.maxBudgetFromConversation * 1.05) {
      score -= 5;
      cautions.push("Pris er litt over uttrykt budsjett");
    } else {
      score -= 25;
      cautions.push("Pris er over uttrykt budsjett");
    }
  } else if (profile.preferredPrice != null && price) {
    const delta = Math.abs(price - profile.preferredPrice) / profile.preferredPrice;
    if (delta <= 0.1) {
      score += 12;
      reasons.push("Prisnivå ligger tett på tidligere interesserte boliger");
    } else if (delta <= 0.2) score += 7;
    else if (delta <= 0.35) score += 2;
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const label: PropertyMatchV2["label"] = bounded >= 80 ? "STRONG" : bounded >= 65 ? "GOOD" : bounded >= 45 ? "POSSIBLE" : "WEAK";
  return { score: bounded, label, reasons: reasons.slice(0, 4), cautions: cautions.slice(0, 3), profile };
}
