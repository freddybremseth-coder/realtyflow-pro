export type FreddyReviewKind =
  | "final_send"
  | "shortlist"
  | "buyer_criteria"
  | "buyer_intake"
  | "no_match";

export type FreddyReviewAction = "approve_send" | "reject" | "edit" | "ask_customer_clarification";

export type FreddyReviewWorkItem = {
  id: string;
  sourceType?: string | null;
  title?: string | null;
  priority?: string | null;
  metadata?: unknown;
  updatedAt?: string | null;
};

export type FreddyReviewDescriptor = {
  id: string;
  kind: FreddyReviewKind;
  title: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  updatedAt: string | null;
  recommendation: string;
  uncertainty: string[];
  actions: FreddyReviewAction[];
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function enabled(value: unknown) {
  return value === true || String(value).toLowerCase() === "true";
}

export function classifyFreddyReview(metadataValue: unknown): FreddyReviewKind | null {
  const metadata = asRecord(metadataValue);
  if (enabled(metadata.presentation_review_required)) return "final_send";
  if (enabled(metadata.shortlist_review_required)) return "shortlist";
  if (enabled(metadata.no_match_review_required)) return "no_match";
  if (metadata.kind === "buyer_profile_email_review" && enabled(metadata.requires_human_interpretation)) return "buyer_criteria";
  if (metadata.kind === "buyer_intake_review") return "buyer_intake";
  return null;
}

function priority(value: unknown): FreddyReviewDescriptor["priority"] {
  const normalized = String(value || "MEDIUM").toUpperCase();
  return normalized === "HIGH" || normalized === "LOW" ? normalized : "MEDIUM";
}

export function describeFreddyReview(row: FreddyReviewWorkItem): FreddyReviewDescriptor | null {
  const kind = classifyFreddyReview(row.metadata);
  if (!kind) return null;
  const expectedSource = kind === "buyer_intake" || kind === "buyer_criteria" ? "ai_agent" : "crm";
  if (row.sourceType && row.sourceType !== expectedSource) return null;
  const metadata = asRecord(row.metadata);
  const uncertainty = (() => {
    if (kind === "final_send") {
      return [
        ...(!enabled(metadata.shortlist_human_review_complete) ? ["Shortlist-review er ikke dokumentert komplett."] : []),
        ...(!metadata.presentation_id ? ["Presentasjon mangler."] : []),
        ...(!metadata.presentation_message_draft_id ? ["E-postutkast mangler."] : []),
      ];
    }
    if (kind === "shortlist") return ["Kandidater må få en eksplisitt kvalitetsbeslutning."];
    if (kind === "buyer_criteria") return [String(metadata.human_interpretation_reason || "Kundesvaret kan ikke tolkes sikkert automatisk.")];
    if (kind === "no_match") return [String(metadata.no_match_followup_reason || "Ingen treff med dagens godkjente kriterier.")];
    return ["AI-forslag må godkjennes før Buyer Profile opprettes eller versjoneres."];
  })();
  const recommendation = kind === "final_send"
    ? "Kontroller presentasjon og e-postutkast. Godkjenning autoriserer bare ny preflight; den sender ikke direkte."
    : kind === "shortlist"
      ? "Marker bare dokumenterte og kundeklare boliger som klare for kunde."
      : kind === "buyer_criteria"
        ? "Tolk kundens svar og versjoner Buyer Profile med eksplisitte kriterier."
        : kind === "no_match"
          ? "Vurder om kunden bør spørres om fleksibilitet; ikke endre kriterier uten svar."
          : "Godkjenn bare eksplisitt evidens og eventuelt én routing-persona.";
  const actions: FreddyReviewAction[] = kind === "final_send"
    ? ["approve_send", "reject", "edit"]
    : kind === "no_match"
      ? ["ask_customer_clarification", "edit"]
      : kind === "buyer_criteria"
        ? ["edit", "ask_customer_clarification"]
        : ["edit", "reject"];

  return {
    id: row.id,
    kind,
    title: String(row.title || "Freddy review"),
    priority: priority(row.priority),
    updatedAt: row.updatedAt || null,
    recommendation,
    uncertainty,
    actions,
  };
}

export function sortFreddyReviews<T extends Pick<FreddyReviewDescriptor, "priority" | "updatedAt">>(items: T[]) {
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return [...items].sort((a, b) => rank[a.priority] - rank[b.priority]
    || String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")));
}
