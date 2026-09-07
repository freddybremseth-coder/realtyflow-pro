export type CustomerMemoryEvidence = {
  known: string[];
  avoid: string[];
  evidenceCount: number;
  confidence: "high" | "medium" | "low";
};

type FeedbackRow = {
  action?: string | null;
  property_id?: string | null;
  created_at?: string | null;
};

type PropertyRow = {
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

function flattenText(value: unknown, limit = 12): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenText(item, limit)).slice(0, limit);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .flatMap((item) => flattenText(item, limit))
      .slice(0, limit);
  }
  return [String(value)];
}

function concise(value: string, max = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function propertyLabel(property: PropertyRow | undefined) {
  if (!property) return null;
  const parts = [property.ref, property.location, property.bedrooms ? `${property.bedrooms} sov` : null, property.price ? `€${Number(property.price).toLocaleString("nb-NO")}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : property.title_no || property.title_en || property.title_es || null;
}

export function buildCustomerMemory(input: {
  notes?: unknown;
  interactions?: unknown;
  recentConversation?: Array<{ ai_summary?: string | null; subject?: string | null; direction?: string | null }>;
  feedback?: FeedbackRow[];
  propertiesById?: Map<string, PropertyRow>;
}): CustomerMemoryEvidence {
  const known: string[] = [];
  const avoid: string[] = [];
  let evidenceCount = 0;

  const notes = flattenText(input.notes, 4).map((value) => concise(value));
  for (const note of notes) {
    if (!known.includes(note)) known.push(note);
    evidenceCount += 1;
  }

  const interactions = flattenText(input.interactions, 5).map((value) => concise(value));
  for (const interaction of interactions) {
    if (!known.includes(interaction)) known.push(interaction);
    evidenceCount += 1;
  }

  for (const message of (input.recentConversation || []).slice(0, 5)) {
    const summary = concise(String(message.ai_summary || message.subject || ""));
    if (!summary) continue;
    const prefix = message.direction === "outbound" ? "Vi sendte" : "Kunden skrev";
    const item = `${prefix}: ${summary}`;
    if (!known.includes(item)) known.push(item);
    evidenceCount += 1;
  }

  for (const feedback of (input.feedback || []).slice(0, 12)) {
    const property = input.propertiesById?.get(String(feedback.property_id || ""));
    const label = propertyLabel(property) || `bolig ${feedback.property_id || "ukjent"}`;
    if (feedback.action === "not_for_me") {
      const item = `Ikke for meg: ${label}`;
      if (!avoid.includes(item)) avoid.push(item);
      evidenceCount += 1;
    } else if (feedback.action === "interested") {
      const item = `Interessert i: ${label}`;
      if (!known.includes(item)) known.push(item);
      evidenceCount += 1;
    }
  }

  return {
    known: known.slice(0, 8),
    avoid: avoid.slice(0, 6),
    evidenceCount,
    confidence: evidenceCount >= 6 ? "high" : evidenceCount >= 3 ? "medium" : "low",
  };
}

export function propertyFeedbackScore(propertyId: string, feedback: FeedbackRow[]) {
  let score = 0;
  for (const row of feedback) {
    if (String(row.property_id || "") !== propertyId) continue;
    if (row.action === "interested") score += 25;
    if (row.action === "not_for_me") score -= 100;
  }
  return score;
}

export function shouldAvoidProperty(propertyId: string, feedback: FeedbackRow[]) {
  const matching = feedback.filter((row) => String(row.property_id || "") === propertyId);
  const latest = matching.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  return latest?.action === "not_for_me";
}
