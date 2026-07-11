export type CustomerTimelineKind = "interaction" | "portal" | "profile" | "shortlist" | "presentation" | "draft" | "task";

export interface CustomerTimelineEvent {
  id: string;
  kind: CustomerTimelineKind;
  title: string;
  detail?: string | null;
  occurredAt: string;
  direction?: "in" | "out" | "internal";
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

export function buildCustomerTimeline(parts: Array<CustomerTimelineEvent[] | null | undefined>) {
  const unique = new Map<string, CustomerTimelineEvent>();
  for (const event of parts.flatMap((part) => part || [])) unique.set(`${event.kind}:${event.id}`, event);
  return sortCustomerTimeline([...unique.values()]);
}
