import { REVENUE_EVENT_LABELS, type RevenueEventType } from "@/lib/revenue/events";

export type CustomerTimelineKind = "interaction" | "portal" | "profile" | "shortlist" | "presentation" | "draft" | "task" | "revenue";

export interface CustomerTimelineEvent {
  id: string;
  kind: CustomerTimelineKind;
  title: string;
  detail?: string | null;
  occurredAt: string;
  direction?: "in" | "out" | "internal";
}

export interface CustomerRevenueEventInput {
  id?: string | null;
  event_type?: string | null;
  title?: string | null;
  description?: string | null;
  source_system?: string | null;
  source_type?: string | null;
  actor_type?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Customer360ContactInput {
  email?: string | null;
  phone?: string | null;
  pipeline_value?: number | null;
  property_interest?: string | null;
  preferred_location?: string | null;
  next_followup?: string | null;
}

export interface BuyerCriterionInput {
  key?: string | null;
  other_key?: string | null;
  approval_status?: string | null;
  active?: boolean | null;
}

export function buildCustomerProfileCompleteness(
  contact: Customer360ContactInput,
  criteria: BuyerCriterionInput[] = [],
) {
  const activeCriteria = criteria.filter((item) => item.active !== false);
  const present = (key: string) => activeCriteria.some((item) => item.key === key && item.approval_status !== "rejected");
  const hasTimeline = activeCriteria.some(
    (item) => item.key === "other" && /timeline|tidslinje|purchase timing|kjøpstid/i.test(String(item.other_key || "")),
  );

  const checks = [
    { id: "contact", label: "Kontaktkanal", complete: Boolean(contact.email || contact.phone) },
    { id: "budget", label: "Budsjett", complete: Number(contact.pipeline_value || 0) > 0 || present("total_budget") || present("purchase_price") },
    { id: "location", label: "Område", complete: Boolean(contact.preferred_location || contact.property_interest) || present("location") },
    { id: "property-type", label: "Boligtype", complete: present("property_type") },
    { id: "bedrooms", label: "Soverom", complete: present("bedrooms") },
    { id: "timeline", label: "Kjøpstidslinje", complete: hasTimeline },
    { id: "next-action", label: "Neste oppfølging", complete: Boolean(contact.next_followup) },
  ];

  const completed = checks.filter((item) => item.complete).length;
  return {
    score: Math.round((completed / checks.length) * 100),
    completed,
    total: checks.length,
    checks,
    missing: checks.filter((item) => !item.complete).map((item) => item.label),
  };
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function sortCustomerTimeline(events: CustomerTimelineEvent[]) {
  return [...events].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export function buildContactInteractionEvents(interactions: unknown): CustomerTimelineEvent[] {
  if (!Array.isArray(interactions)) return [];
  return interactions.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const occurredAt = validDate(item.date || item.created_at || item.timestamp);
    if (!occurredAt) return [];
    const type = String(item.type || "kontakt").toLowerCase();
    return [{
      id: String(item.id || `interaction-${index}-${occurredAt}`),
      kind: "interaction" as const,
      title: type === "email" ? "E-postaktivitet" : type === "call" ? "Telefonsamtale" : "Kundeaktivitet",
      detail: String(item.content || item.body || item.message || "").trim() || null,
      occurredAt,
      direction: item.direction === "in" ? "in" as const : item.direction === "out" ? "out" as const : "internal" as const,
    }];
  });
}

function revenueEventDirection(eventType: string, actorType: string): CustomerTimelineEvent["direction"] {
  if (eventType === "email_received" || eventType === "lead_created" || eventType === "contact_created" || eventType === "meeting_booked") return "in";
  if (eventType === "message_sent" || eventType === "nurture_step_sent") return "out";
  if (actorType === "customer") return "in";
  return "internal";
}

function revenueEventDetail(row: CustomerRevenueEventInput) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const sourceType = String(row.source_type || "").trim().toLowerCase();

  if (sourceType === "preferences_updated") {
    return String(metadata.summary || row.description || "").trim() || null;
  }

  if (sourceType === "customer_message") {
    return String(metadata.body_preview || row.description || "").trim() || null;
  }

  if (sourceType === "single_property_pdf" || sourceType === "multi_property_pdf") {
    const titles = Array.isArray(metadata.property_titles)
      ? metadata.property_titles.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const propertyLabel = String(metadata.property_title || titles.join(", ") || "").trim();
    const recipient = String(metadata.primary_recipient || "").trim();
    const filename = String(metadata.filename || "").trim();
    return [
      propertyLabel ? `Prospekt: ${propertyLabel}` : "Prospekt sendt",
      recipient ? `til ${recipient}` : null,
      filename || null,
    ].filter(Boolean).join(" · ") || row.description || null;
  }

  if (sourceType === "market_report_published") {
    return String(metadata.report_title || row.description || "").trim() || null;
  }

  return String(
    row.description
      || metadata.body_preview
      || metadata.summary
      || metadata.property_title
      || metadata.report_title
      || metadata.subject
      || metadata.source
      || row.source_system
      || ""
  ).trim() || null;
}

export function buildRevenueTimelineEvents(events: CustomerRevenueEventInput[]): CustomerTimelineEvent[] {
  return (events || []).flatMap((row) => {
    const occurredAt = validDate(row.occurred_at || row.created_at);
    if (!occurredAt) return [];
    const eventType = String(row.event_type || "note");
    const actorType = String(row.actor_type || "system");
    const fallbackTitle = REVENUE_EVENT_LABELS[eventType as RevenueEventType] || "Revenue-hendelse";

    return [{
      id: String(row.id || `revenue-${eventType}-${occurredAt}`),
      kind: "revenue" as const,
      title: String(row.title || fallbackTitle),
      detail: revenueEventDetail(row),
      occurredAt,
      direction: revenueEventDirection(eventType, actorType),
    }];
  });
}

export function buildCustomerTimeline(parts: Array<CustomerTimelineEvent[] | null | undefined>) {
  const unique = new Map<string, CustomerTimelineEvent>();
  for (const event of parts.flatMap((part) => part || [])) unique.set(`${event.kind}:${event.id}`, event);
  return sortCustomerTimeline([...unique.values()]);
}
