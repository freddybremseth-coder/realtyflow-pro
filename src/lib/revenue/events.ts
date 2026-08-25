export const REVENUE_EVENT_TYPES = [
  "lead_created",
  "contact_created",
  "contact_updated",
  "qualified",
  "work_item_created",
  "email_received",
  "email_analyzed",
  "profile_created",
  "profile_approved",
  "shortlist_created",
  "presentation_created",
  "draft_created",
  "message_approved",
  "message_sent",
  "followup_scheduled",
  "followup_completed",
  "meeting_booked",
  "viewing_scheduled",
  "viewing_completed",
  "offer_made",
  "property_interested",
  "property_not_for_me",
  "deal_won",
  "deal_lost",
  "commission_invoiced",
  "commission_paid",
  "nurture_step_sent",
  "automation_recommended",
  "automation_executed",
  "data_quality_fixed",
  "note",
] as const;

export const REVENUE_ACTOR_TYPES = ["human", "ai", "automation", "system", "customer", "external"] as const;

export type RevenueEventType = (typeof REVENUE_EVENT_TYPES)[number];
export type RevenueActorType = (typeof REVENUE_ACTOR_TYPES)[number];

export interface RevenueEventInput {
  eventType: RevenueEventType;
  title?: string | null;
  description?: string | null;
  contactId?: string | null;
  brandId?: string | null;
  sourceSystem?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  actorType?: RevenueActorType | null;
  actorId?: string | null;
  confidenceScore?: number | null;
  revenueImpactEur?: number | null;
  occurredAt?: string | Date | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export interface RevenueEventPayload {
  event_type: RevenueEventType;
  title: string;
  description: string | null;
  contact_id: string | null;
  brand_id: string | null;
  source_system: string;
  source_type: string | null;
  source_id: string | null;
  actor_type: RevenueActorType;
  actor_id: string | null;
  confidence_score: number | null;
  revenue_impact_eur: number | null;
  occurred_at: string;
  dedupe_key: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
}

export interface RevenueEventInsertResult {
  ok: boolean;
  event?: Record<string, unknown> | null;
  duplicate?: boolean;
  tableNotReady?: boolean;
  error?: string;
}

const FALLBACK_SOURCE_SYSTEM = "realtyflow";

export function buildRevenueEventDedupeKey(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => String(part).trim().toLowerCase())
    .join(":");
}

export function normalizeRevenueEventInput(input: RevenueEventInput): RevenueEventPayload {
  const occurredAt = input.occurredAt instanceof Date
    ? input.occurredAt.toISOString()
    : input.occurredAt || new Date().toISOString();

  return {
    event_type: input.eventType,
    title: input.title?.trim() || input.eventType.replaceAll("_", " "),
    description: input.description?.trim() || null,
    contact_id: input.contactId?.trim() || null,
    brand_id: input.brandId?.trim() || null,
    source_system: input.sourceSystem?.trim() || FALLBACK_SOURCE_SYSTEM,
    source_type: input.sourceType?.trim() || null,
    source_id: input.sourceId?.trim() || null,
    actor_type: input.actorType || "system",
    actor_id: input.actorId?.trim() || null,
    confidence_score: input.confidenceScore ?? null,
    revenue_impact_eur: input.revenueImpactEur ?? null,
    occurred_at: occurredAt,
    dedupe_key: input.dedupeKey?.trim() || null,
    metadata: input.metadata || {},
    created_by: input.createdBy?.trim() || null,
  };
}

function isMissingRevenueEventsTable(message?: string | null) {
  const value = String(message || "").toLowerCase();
  return value.includes("revenue_events") && (value.includes("does not exist") || value.includes("schema cache"));
}

export async function insertRevenueEvent(
  supabase: { from: (table: string) => any },
  input: RevenueEventInput,
): Promise<RevenueEventInsertResult> {
  const payload = normalizeRevenueEventInput(input);
  const { data, error } = await supabase
    .from("revenue_events")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (!error) return { ok: true, event: data ?? null };

  if (payload.dedupe_key && String(error.code || "") === "23505") {
    return { ok: true, duplicate: true };
  }

  if (isMissingRevenueEventsTable(error.message)) {
    return { ok: false, tableNotReady: true, error: error.message };
  }

  return { ok: false, error: error.message || "Revenue event insert failed" };
}
