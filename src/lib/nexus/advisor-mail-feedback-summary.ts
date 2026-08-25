export interface PropertyFeedbackSummary {
  propertyId: string;
  interested: number;
  notForMe: number;
  latestAction?: "interested" | "not_for_me" | null;
  latestAt?: string | null;
}

export function summarizePropertyFeedback(rows: Array<{ property_id: string; action: string; created_at?: string | null }>) {
  const byProperty = new Map<string, PropertyFeedbackSummary>();
  for (const row of rows) {
    const propertyId = String(row.property_id || "");
    if (!propertyId) continue;
    const current = byProperty.get(propertyId) || {
      propertyId,
      interested: 0,
      notForMe: 0,
      latestAction: null,
      latestAt: null,
    };
    if (row.action === "interested") current.interested += 1;
    if (row.action === "not_for_me") current.notForMe += 1;
    if (!current.latestAt || String(row.created_at || "") > current.latestAt) {
      current.latestAt = row.created_at || null;
      current.latestAction = row.action === "interested" || row.action === "not_for_me" ? row.action : null;
    }
    byProperty.set(propertyId, current);
  }
  return [...byProperty.values()];
}
