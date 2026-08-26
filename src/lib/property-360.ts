export interface Property360ShortlistItemInput {
  id?: string | null;
  shortlist_id?: string | null;
  brand?: string | null;
  property_id?: string | null;
  property_reference?: string | null;
  property_title?: string | null;
  property_location?: string | null;
  property_price?: number | null;
  rank?: number | null;
  decision?: string | null;
  system_eligibility?: string | null;
  score?: number | null;
  data_quality_score?: number | null;
  reasons?: unknown;
  concerns?: unknown;
  questions_to_verify?: unknown;
  created_at?: string | null;
}

export interface Property360BuyerInput {
  shortlistId: string;
  buyerProfileId: string;
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  pipelineStatus?: string | null;
  pipelineValue?: number | null;
  profileStatus?: string | null;
  purchaseReadiness?: string | null;
  profileSummary?: string | null;
  shortlistStatus?: string | null;
  shortlistTitle?: string | null;
  item: Property360ShortlistItemInput;
}

export interface Property360BuyerMatch {
  shortlistId: string;
  buyerProfileId: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string | null;
  score: number;
  priority: "HOT" | "WARM" | "WATCH";
  pipelineStatus: string;
  purchaseReadiness: string | null;
  reason: string;
  reasons: string[];
  concerns: string[];
  questionsToVerify: string[];
  shortlistStatus: string | null;
  shortlistTitle: string | null;
  propertyReference: string | null;
  propertyTitle: string | null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10)
    : [];
}

function normalizedStatus(value: unknown) {
  return String(value || "NEW").trim().toUpperCase();
}

function priorityFor(score: number, status: string) {
  if (score >= 85 || status === "NEGOTIATION" || (score >= 75 && status === "VIEWING")) return "HOT" as const;
  if (score >= 65 || ["VIEWING", "QUALIFIED"].includes(status)) return "WARM" as const;
  return "WATCH" as const;
}

function statusBoost(status: string) {
  if (status === "NEGOTIATION") return 12;
  if (status === "VIEWING") return 8;
  if (status === "QUALIFIED") return 4;
  return 0;
}

export function rankPropertyBuyerMatches(rows: Property360BuyerInput[]): Property360BuyerMatch[] {
  const bestByProfile = new Map<string, Property360BuyerMatch>();

  for (const row of rows) {
    const itemScore = Math.max(0, Math.min(100, Number(row.item.score || 0)));
    const quality = Math.max(0, Math.min(100, Number(row.item.data_quality_score || 0)));
    const pipelineStatus = normalizedStatus(row.pipelineStatus);
    const shortlistApproved = String(row.shortlistStatus || "").toLowerCase() === "approved";
    const eligibility = String(row.item.system_eligibility || "").toLowerCase();

    let score = itemScore;
    score += statusBoost(pipelineStatus);
    if (shortlistApproved) score += 3;
    if (quality >= 80) score += 2;
    if (eligibility === "conditional") score -= 8;
    if (eligibility === "rejected") score -= 30;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const reasons = stringArray(row.item.reasons);
    const concerns = stringArray(row.item.concerns);
    const questionsToVerify = stringArray(row.item.questions_to_verify);
    const priority = priorityFor(score, pipelineStatus);
    const reason = reasons[0]
      || (pipelineStatus === "NEGOTIATION" ? "Kunden er allerede i forhandling." : null)
      || (pipelineStatus === "VIEWING" ? "Kunden er i visningsfase." : null)
      || `Lagret Lead Intelligence-match på ${itemScore}/100.`;

    const match: Property360BuyerMatch = {
      shortlistId: row.shortlistId,
      buyerProfileId: row.buyerProfileId,
      contactId: row.contactId || null,
      contactName: String(row.contactName || row.contactEmail || "Ukjent kunde"),
      contactEmail: row.contactEmail || null,
      score,
      priority,
      pipelineStatus,
      purchaseReadiness: row.purchaseReadiness || null,
      reason,
      reasons,
      concerns,
      questionsToVerify,
      shortlistStatus: row.shortlistStatus || null,
      shortlistTitle: row.shortlistTitle || null,
      propertyReference: row.item.property_reference || null,
      propertyTitle: row.item.property_title || null,
    };

    const existing = bestByProfile.get(row.buyerProfileId);
    if (!existing || match.score > existing.score) bestByProfile.set(row.buyerProfileId, match);
  }

  const weights = { HOT: 3, WARM: 2, WATCH: 1 } as const;
  return [...bestByProfile.values()].sort((a, b) =>
    weights[b.priority] - weights[a.priority]
    || b.score - a.score
    || a.contactName.localeCompare(b.contactName, "nb"),
  );
}
