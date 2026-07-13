export const REVENUE_EVENT_TYPES = [
  "lead_created",
  "contact_created",
  "contact_updated",
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

export interface RevenueEventsSupabaseLike {
  from(table: string): any;
}

export const REVENUE_EVENT_LABELS: Record<RevenueEventType, string> = {
  lead_created: "Lead opprettet",
  contact_created: "Kontakt opprettet",
  contact_updated: "Kontakt oppdatert",
  work_item_created: "Oppgave opprettet",
  email_received: "E-post mottatt",
  email_analyzed: "E-post analysert",
  profile_created: "Kjøperprofil opprettet",
  profile_approved: "Kjøperprofil godkjent",
  shortlist_created: "Shortlist opprettet",
  presentation_created: "Presentasjon opprettet",
  draft_created: "Utkast opprettet",
  message_approved: "Melding godkjent",
  message_sent: "Melding sendt",
  followup_scheduled: "Oppfølging planlagt",
  followup_completed: "Oppfølging fullført",
  meeting_booked: "Møte booket",
  viewing_scheduled: "Visning planlagt",
  viewing_completed: "Visning fullført",
  offer_made: "Bud/tilbud gitt",
  deal_won: "Salg vunnet",
  deal_lost: "Salg tapt",
  commission_invoiced: "Provisjon fakturert",
  commission_paid: "Provisjon betalt",
  nurture_step_sent: "Nurture-steg sendt",
  automation_recommended: "Automasjon anbefalte handling",
  automation_executed: "Automasjon utførte handling",
  data_quality_fixed: "Datakvalitet rettet",
  note: "Notat",
};

function clean(value: unknown) {
  const output = String(value || "").trim();
  return output || null;
}

function iso(value: string | Date | null | undefined) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRevenueEventType(value: unknown): value is RevenueEventType {
  return REVENUE_EVENT_TYPES.includes(value as RevenueEventType);
}

export function isRevenueActorType(value: unknown): value is RevenueActorType {
  return REVENUE_ACTOR_TYPES.includes(value as RevenueActorType);
}

export function normalizeRevenueEvent(input: RevenueEventInput): RevenueEventPayload {
  if (!isRevenueEventType(input.eventType)) {
    throw new Error(`Unsupported revenue event type: ${String(input.eventType)}`);
  }

  const actorType = input.actorType && isRevenueActorType(input.actorType) ? input.actorType : "system";
  const confidence = numberOrNull(input.confidenceScore);
  const revenueImpact = numberOrNull(input.revenueImpactEur);

  return {
    event_type: input.eventType,
    title: clean(input.title) || REVENUE_EVENT_LABELS[input.eventType],
    description: clean(input.description),
    contact_id: clean(input.contactId),
    brand_id: clean(input.brandId),
    source_system: clean(input.sourceSystem) || "manual",
    source_type: clean(input.sourceType),
    source_id: clean(input.sourceId),
    actor_type: actorType,
    actor_id: clean(input.actorId),
    confidence_score: confidence === null ? null : Math.max(0, Math.min(100, Math.round(confidence))),
    revenue_impact_eur: revenueImpact,
    occurred_at: iso(input.occurredAt),
    dedupe_key: clean(input.dedupeKey),
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {},
    created_by: clean(input.createdBy),
  };
}

export function isRevenueEventsTableMissing(message?: string | null) {
  return /revenue_events|schema cache|does not exist|relation/i.test(String(message || ""));
}

export async function insertRevenueEvent(
  supabase: RevenueEventsSupabaseLike,
  input: RevenueEventInput,
): Promise<RevenueEventInsertResult> {
  const payload = normalizeRevenueEvent(input);

  try {
    const { data, error } = await supabase
      .from("revenue_events")
      .insert(payload)
      .select("*")
      .single();

    if (!error) return { ok: true, event: data || null, duplicate: false };

    if (error.code === "23505" && payload.dedupe_key) {
      const existing = await supabase
        .from("revenue_events")
        .select("*")
        .eq("dedupe_key", payload.dedupe_key)
        .maybeSingle();
      if (!existing.error && existing.data) {
        return { ok: true, event: existing.data, duplicate: true };
      }
    }

    return {
      ok: false,
      error: error.message || "Could not insert revenue event",
      tableNotReady: isRevenueEventsTableMissing(error.message),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not insert revenue event",
    };
  }
}

export function buildRevenueEventDedupeKey(parts: Array<string | null | undefined>) {
  const key = parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(":")
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 240);

  return key || null;
}

export function summarizeRevenueEvents(events: Array<Record<string, any>>) {
  const total = events.length;
  const byType = events.reduce<Record<string, number>>((acc, event) => {
    const type = String(event.event_type || "unknown");
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const revenueImpactEur = events.reduce((sum, event) => {
    const value = numberOrNull(event.revenue_impact_eur);
    return sum + (value || 0);
  }, 0);
  const latestAt = events
    .map((event) => new Date(String(event.occurred_at || event.created_at || "")).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return {
    total,
    byType,
    revenueImpactEur,
    latestAt: latestAt ? new Date(latestAt).toISOString() : null,
  };
}
