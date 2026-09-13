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
  semanticInvalid?: boolean;
  error?: string;
}

export interface RevenueEventsSupabaseLike {
  from(table: string): any;
}

export const REVENUE_EVENT_LABELS: Record<RevenueEventType, string> = {
  lead_created: "Lead opprettet",
  contact_created: "Kontakt opprettet",
  contact_updated: "Kontakt oppdatert",
  qualified: "Lead kvalifisert",
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
  property_interested: "Bolig markert interessant",
  property_not_for_me: "Bolig markert ikke for meg",
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

export const CANONICAL_REVENUE_OUTCOME_TYPES = [
  "lead_created",
  "qualified",
  "viewing_completed",
  "offer_made",
  "deal_won",
  "commission_invoiced",
  "commission_paid",
] as const satisfies readonly RevenueEventType[];

export type CanonicalRevenueOutcomeType = (typeof CANONICAL_REVENUE_OUTCOME_TYPES)[number];

export interface RevenueEventSemanticAssessment {
  version: 1;
  canonicalOutcome: boolean;
  valid: boolean;
  blockers: string[];
}

/**
 * Measurement contract for commercial outcomes. Operational events remain
 * append-first, while canonical outcomes require stable identity, provenance
 * and idempotency before they may enter the revenue ledger.
 */
export function assessRevenueEventSemantics(payload: RevenueEventPayload): RevenueEventSemanticAssessment {
  const canonicalOutcome = CANONICAL_REVENUE_OUTCOME_TYPES.includes(payload.event_type as CanonicalRevenueOutcomeType);
  if (!canonicalOutcome) return { version: 1, canonicalOutcome: false, valid: true, blockers: [] };

  const blockers: string[] = [];
  if (!payload.contact_id) blockers.push("contact_id_required");
  if (!payload.brand_id) blockers.push("brand_id_required");
  if (!clean(payload.source_system)) blockers.push("source_system_required");
  if (!payload.source_type) blockers.push("source_type_required");
  if (!payload.source_id) blockers.push("source_id_required");
  if (!payload.dedupe_key) blockers.push("dedupe_key_required");

  const metadata = payload.metadata || {};
  const nextStatus = String((metadata as any).next_status || "").toUpperCase();
  if (payload.event_type === "qualified" && nextStatus !== "QUALIFIED" && !clean((metadata as any).qualification_basis)) {
    blockers.push("qualification_evidence_required");
  }
  if (payload.event_type === "deal_won" && nextStatus !== "WON" && !clean((metadata as any).deal_id) && !clean((metadata as any).transaction_ref)) {
    blockers.push("won_evidence_required");
  }
  if (payload.event_type === "commission_invoiced" || payload.event_type === "commission_paid") {
    const commission = numberOrNull((metadata as any).commission_eur) ?? numberOrNull(payload.revenue_impact_eur);
    if (commission === null || commission <= 0) blockers.push("positive_commission_required");
    if (!clean((metadata as any).invoice_number)) blockers.push("invoice_number_required");
    if (payload.event_type === "commission_paid" && !clean((metadata as any).paid_at)) blockers.push("paid_at_required");
  }

  return { version: 1, canonicalOutcome: true, valid: blockers.length === 0, blockers };
}

export function isRevenueEventType(value: unknown): value is RevenueEventType {
  return REVENUE_EVENT_TYPES.includes(value as RevenueEventType);
}

export function isRevenueActorType(value: unknown): value is RevenueActorType {
  return REVENUE_ACTOR_TYPES.includes(value as RevenueActorType);
}

export function normalizeRevenueEvent(input: RevenueEventInput): RevenueEventPayload {
  if (!isRevenueEventType(input.eventType)) throw new Error(`Unsupported revenue event type: ${String(input.eventType)}`);
  const canonicalOutcome = CANONICAL_REVENUE_OUTCOME_TYPES.includes(input.eventType as CanonicalRevenueOutcomeType);
  const actorType = input.actorType && isRevenueActorType(input.actorType) ? input.actorType : "system";
  const confidence = numberOrNull(input.confidenceScore);
  const revenueImpact = numberOrNull(input.revenueImpactEur);
  const payload: RevenueEventPayload = {
    event_type: input.eventType,
    title: clean(input.title) || REVENUE_EVENT_LABELS[input.eventType],
    description: clean(input.description),
    contact_id: clean(input.contactId),
    brand_id: clean(input.brandId),
    source_system: clean(input.sourceSystem) || (canonicalOutcome ? "" : "manual"),
    source_type: clean(input.sourceType),
    source_id: clean(input.sourceId),
    actor_type: actorType,
    actor_id: clean(input.actorId),
    confidence_score: confidence === null ? null : Math.max(0, Math.min(100, Math.round(confidence))),
    revenue_impact_eur: revenueImpact,
    occurred_at: iso(input.occurredAt),
    dedupe_key: clean(input.dedupeKey),
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? { ...input.metadata } : {},
    created_by: clean(input.createdBy),
  };
  const semantics = assessRevenueEventSemantics(payload);
  if (!semantics.valid) {
    throw new Error(`REVENUE_EVENT_SEMANTICS_INVALID:${payload.event_type}:${semantics.blockers.join(",")}`);
  }
  payload.metadata.revenue_event_semantics = semantics;
  return payload;
}

export function isRevenueEventsTableMissing(message?: string | null) {
  return /revenue_events|schema cache|does not exist|relation/i.test(String(message || ""));
}

const REVENUE_TO_TOUCH: Partial<Record<RevenueEventType, "lead_created" | "qualified" | "viewing" | "offer" | "sale">> = {
  lead_created: "lead_created",
  qualified: "qualified",
  viewing_completed: "viewing",
  offer_made: "offer",
  deal_won: "sale",
};

async function resolveContactUtmContext(
  supabase: RevenueEventsSupabaseLike,
  contactId: string,
  brandId: string,
): Promise<Record<string, unknown> | null> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("interactions")
    .eq("id", contactId)
    .maybeSingle();
  const interactions = Array.isArray(contact?.interactions) ? contact.interactions : [];
  for (const interaction of interactions) {
    if (clean(interaction?.brand_id) !== brandId) continue;
    const metadata = interaction?.metadata && typeof interaction.metadata === "object" ? interaction.metadata : {};
    const hasAcquisitionContext = [
      "utm_source", "utm_medium", "utm_campaign", "utm_content",
      "content_id", "publication_id", "campaign_id", "visitor_id", "session_id", "channel",
    ].some((key) => clean((metadata as any)[key]));
    if (hasAcquisitionContext) return metadata as Record<string, unknown>;
  }
  return null;
}

async function mirrorRevenueEventToMarketingTouchpoint(
  supabase: RevenueEventsSupabaseLike,
  event: Record<string, any>,
): Promise<void> {
  const eventType = event?.event_type as RevenueEventType;
  const publicLeadRepeat = eventType === "contact_updated" && clean(event?.source_system) === "public_leads";
  const touchType: "lead_created" | "form_submit" | "qualified" | "viewing" | "offer" | "sale" | undefined =
    REVENUE_TO_TOUCH[eventType] ?? (publicLeadRepeat ? "form_submit" : undefined);
  const brandId = clean(event?.brand_id);
  const contactId = clean(event?.contact_id);
  if (!touchType || !brandId || !contactId) return;

  const eventMetadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const explicitAcquisition = [
    "utm_source", "utm_medium", "utm_campaign", "utm_content",
    "content_id", "publication_id", "campaign_id", "visitor_id", "session_id", "channel",
  ].some((key) => clean((eventMetadata as any)[key]));
  const contactUtm = explicitAcquisition
    ? null
    : await resolveContactUtmContext(supabase, contactId, brandId).catch(() => null);
  const metadata = { ...(contactUtm ?? {}), ...eventMetadata } as Record<string, unknown>;
  const utmContent = clean((metadata as any).utm_content) || clean((metadata as any).content_id);
  const requestedPublicationId = clean((metadata as any).publication_id);
  const explicitCampaignId = clean((metadata as any).utm_campaign) || clean((metadata as any).campaign_id);
  const explicitChannel = clean((metadata as any).utm_source) || clean((metadata as any).channel)
    || (clean(event?.source_system) === "public_leads" ? "website" : null);

  let context: any = null;
  let verifiedPublicationId: string | null = null;
  if (requestedPublicationId) {
    const { data: publication } = await supabase
      .from("marketing_publications")
      .select("publication_id,brand_id,content_id,campaign_id,channel")
      .eq("publication_id", requestedPublicationId)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (publication?.publication_id) {
      verifiedPublicationId = String(publication.publication_id);
      context = {
        publication_id: verifiedPublicationId,
        content_id: clean(publication.content_id),
        campaign_id: explicitCampaignId || clean(publication.campaign_id),
        creative_variant_id: null,
        visitor_id: clean((metadata as any).visitor_id),
        session_id: clean((metadata as any).session_id),
        channel: explicitChannel || clean(publication.channel),
        confidence: "exact",
        attribution_context: "verified_publication",
      };
    }
  }
  if (utmContent) {
    const { data: verified } = await supabase
      .from("marketing_content")
      .select("content_id, brand_id")
      .eq("content_id", utmContent)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (verified?.content_id) {
      context = {
        content_id: String(verified.content_id),
        publication_id: verifiedPublicationId,
        campaign_id: explicitCampaignId,
        creative_variant_id: null,
        visitor_id: clean((metadata as any).visitor_id),
        session_id: clean((metadata as any).session_id),
        channel: explicitChannel,
        confidence: "exact",
        attribution_context: "verified_utm_content",
      };
    }
  }

  // Source/campaign are valid deterministic evidence even when there is no
  // content asset. Keep unknown fields explicit; never manufacture content.
  if (!context && (explicitCampaignId || explicitChannel)) {
    context = {
      content_id: null,
      publication_id: null,
      campaign_id: explicitCampaignId,
      creative_variant_id: null,
      visitor_id: clean((metadata as any).visitor_id),
      session_id: clean((metadata as any).session_id),
      channel: explicitChannel,
      confidence: "strong",
      attribution_context: explicitAcquisition ? "explicit_acquisition" : "public_website",
    };
  }

  if (!context) {
    const { data: prior } = await supabase
      .from("marketing_touchpoints")
      .select("content_id, publication_id, campaign_id, creative_variant_id, visitor_id, channel, occurred_at, metadata")
      .eq("brand_id", brandId)
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false })
      .limit(20);
    context = (prior ?? []).find((row: any) => row?.content_id || row?.publication_id || row?.campaign_id || row?.channel) ?? null;
    if (context) context = {
      ...context,
      session_id: clean(context?.metadata?.session_id),
      confidence: "exact",
      attribution_context: "prior_touchpoint",
    };
  }
  if (!context || (!context.content_id && !context.publication_id && !context.campaign_id && !context.channel)) return;

  const explicitCommission = eventType === "deal_won" ? numberOrNull((metadata as any).commission_eur) : null;
  const revenueEventId = clean(event?.id) || clean(event?.dedupe_key) || `${eventType}:${event?.occurred_at}`;
  const dedupeKey = `revenue|${brandId}|${revenueEventId}|${touchType}`;

  const { error } = await supabase.from("marketing_touchpoints").upsert({
    dedupe_key: dedupeKey,
    brand_id: brandId,
    content_id: context.content_id,
    publication_id: context.publication_id ?? null,
    campaign_id: context.campaign_id ?? null,
    creative_variant_id: context.creative_variant_id ?? null,
    visitor_id: context.visitor_id ?? null,
    contact_id: contactId,
    channel: context.channel ?? null,
    touch_type: touchType,
    occurred_at: event?.occurred_at ?? new Date().toISOString(),
    confidence: context.confidence ?? "strong",
    commission_eur: explicitCommission,
    metadata: {
      source: "revenue_events",
      revenue_event_id: clean(event?.id),
      revenue_event_type: eventType,
      revenue_source_system: clean(event?.source_system),
      attribution_context: context.attribution_context,
      session_id: context.session_id ?? clean((metadata as any).session_id),
      utm_source: clean((metadata as any).utm_source),
      utm_medium: clean((metadata as any).utm_medium),
      utm_campaign: clean((metadata as any).utm_campaign),
      utm_content: clean((metadata as any).utm_content),
    },
  }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) throw new Error(`MARKETING_REVENUE_BRIDGE_FAILED: ${error.message}`);
}

export async function insertRevenueEvent(
  supabase: RevenueEventsSupabaseLike,
  input: RevenueEventInput,
): Promise<RevenueEventInsertResult> {
  let payload: RevenueEventPayload;
  try {
    payload = normalizeRevenueEvent(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not normalize revenue event";
    return { ok: false, semanticInvalid: message.startsWith("REVENUE_EVENT_SEMANTICS_INVALID:"), error: message };
  }
  try {
    const { data, error } = await supabase.from("revenue_events").insert(payload).select("*").single();
    if (!error) {
      await mirrorRevenueEventToMarketingTouchpoint(supabase, data || payload).catch(() => undefined);
      return { ok: true, event: data || null, duplicate: false };
    }
    if (error.code === "23505" && payload.dedupe_key) {
      const existing = await supabase.from("revenue_events").select("*").eq("dedupe_key", payload.dedupe_key).maybeSingle();
      if (!existing.error && existing.data) {
        await mirrorRevenueEventToMarketingTouchpoint(supabase, existing.data).catch(() => undefined);
        return { ok: true, event: existing.data, duplicate: true };
      }
    }
    return { ok: false, error: error.message || "Could not insert revenue event", tableNotReady: isRevenueEventsTableMissing(error.message) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not insert revenue event" };
  }
}

export function buildRevenueEventDedupeKey(parts: Array<string | null | undefined>) {
  const key = parts.map((part) => String(part || "").trim().toLowerCase()).filter(Boolean).join(":")
    .replace(/[^a-z0-9:_-]+/g, "-").replace(/-+/g, "-").slice(0, 240);
  return key || null;
}

export function summarizeRevenueEvents(events: Array<Record<string, any>>) {
  const total = events.length;
  const byType = events.reduce<Record<string, number>>((acc, event) => {
    const type = String(event.event_type || "unknown");
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const revenueImpactEur = events.reduce((sum, event) => sum + (numberOrNull(event.revenue_impact_eur) || 0), 0);
  const latestAt = events.map((event) => new Date(String(event.occurred_at || event.created_at || "")).getTime())
    .filter(Number.isFinite).sort((a, b) => b - a)[0];
  return { total, byType, revenueImpactEur, latestAt: latestAt ? new Date(latestAt).toISOString() : null };
}
