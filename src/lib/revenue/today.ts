export type RevenuePriorityKind = "new" | "overdue" | "hot" | "closing" | "followup";
export type RevenuePriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface RevenueContactInput {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  notes?: string | null;
  interactions?: unknown[] | null;
  brand_id?: string | null;
  brand?: string | null;
  source?: string | null;
  property_interest?: string | null;
  last_contact?: string | null;
  next_followup?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  buying_signal_score?: number | null;
  purchase_signal_score?: number | null;
}

export interface RevenueMemoryEventInput {
  event_type?: string | null;
  title?: string | null;
  description?: string | null;
  source_system?: string | null;
  source_type?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RevenueRecommendationContext {
  revenueEvents?: RevenueMemoryEventInput[] | null;
}

export interface RevenueMemoryScore {
  score: number;
  reasons: string[];
}

export interface RevenuePriorityItem {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  brandId: string;
  source: string | null;
  stage: string;
  value: number;
  propertyInterest: string | null;
  kind: RevenuePriorityKind;
  priority: RevenuePriorityLevel;
  score: number;
  reason: string;
  recommendedAction: string;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
  createdAt: string | null;
  isOverdue: boolean;
  isMissingNextAction: boolean;
  href: string;
}

const ACTIVE_STAGES = new Set(["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"]);
const CLOSING_STAGES = new Set(["VIEWING", "NEGOTIATION"]);

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(earlier: Date, later: Date) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 86_400_000);
}

function interactionText(interactions: unknown[] | null | undefined) {
  if (!Array.isArray(interactions)) return "";
  return interactions
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const value = item as Record<string, unknown>;
      return String(value.content || value.body || value.message || "");
    })
    .join(" ");
}

function normalizeStage(value?: string | null) {
  return String(value || "NEW").trim().toUpperCase() || "NEW";
}

function signalScoreFromText(text: string) {
  const normalized = text.toLowerCase();
  let score = 0;
  if (/reservasjon|reserve|reservation|tilbud|offer|forhandling|negotiation/.test(normalized)) score += 22;
  if (/visning|viewing|booket|booked|møte|meeting|reise|flight/.test(normalized)) score += 18;
  if (/klar nå|ready now|innen 3 mnd|within 3 months|finansiering|mortgage|proof of funds/.test(normalized)) score += 16;
  if (/kjøpssignal|oppdaterte ønsker|min side|favoritt|favourite|shortlist|budsjett til/.test(normalized)) score += 14;
  if (/stopp|not interested|ikke aktuelt|tapt|lost/.test(normalized)) score -= 25;
  return Math.max(-25, Math.min(35, score));
}

function eventTime(event: RevenueMemoryEventInput) {
  return safeDate(event.occurred_at || event.created_at);
}

function eventText(event: RevenueMemoryEventInput) {
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  return [
    event.title,
    event.description,
    event.source_system,
    event.source_type,
    metadata.subject,
    metadata.body_preview,
    metadata.source,
    metadata.summary,
    metadata.property_interest,
    metadata.report_title,
  ].map((value) => String(value || "")).join(" ").toLowerCase();
}

function eventSourceType(event: RevenueMemoryEventInput) {
  return String(event.source_type || "").trim().toLowerCase();
}

function eventSourceSystem(event: RevenueMemoryEventInput) {
  return String(event.source_system || "").trim().toLowerCase();
}

export function recommendActionFromRevenueMemory(
  events: RevenueMemoryEventInput[] | null | undefined,
  now = new Date(),
) {
  const sorted = [...(events || [])]
    .map((event) => ({ event, at: eventTime(event) }))
    .filter((item): item is { event: RevenueMemoryEventInput; at: Date } => Boolean(item.at))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const recentInbound = sorted.find((item) => {
    const ageDays = daysBetween(item.at, now);
    return item.event.event_type === "email_received" && ageDays <= 3;
  });
  if (recentInbound) {
    return "Kunden har svart nylig. Les siste e-post og svar personlig med ett konkret neste steg.";
  }

  const recentPortalMessage = sorted.find((item) => {
    const ageDays = daysBetween(item.at, now);
    return eventSourceType(item.event) === "customer_message" && ageDays <= 3;
  });
  if (recentPortalMessage) {
    return "Kunden har skrevet på Min side. Les meldingen, svar personlig og gjør neste steg helt konkret.";
  }

  const recentPreferenceUpdate = sorted.find((item) => {
    const ageDays = daysBetween(item.at, now);
    return eventSourceType(item.event) === "preferences_updated" && ageDays <= 7;
  });
  if (recentPreferenceUpdate) {
    return "Kunden oppdaterte boligønsker på Min side. Match 3–5 boliger mot nytt budsjett/område og foreslå en kort rådgivningssamtale.";
  }

  const recentBooking = sorted.find((item) => {
    const ageDays = daysBetween(item.at, now);
    return item.event.event_type === "meeting_booked" && ageDays <= 14;
  });
  if (recentBooking) {
    return "Møte er booket. Forbered kundens behov, budsjett og 3–5 relevante boliger før samtalen.";
  }

  const propertyPdfSent = sorted.find((item) => {
    const ageDays = daysBetween(item.at, now);
    return item.event.event_type === "message_sent"
      && eventSourceSystem(item.event) === "property_pdf"
      && ageDays >= 1
      && ageDays <= 10;
  });
  if (propertyPdfSent) {
    return "Kunden fikk konkret prospekt tilsendt. Følg opp med én tydelig anbefaling og spør om visning eller shortlist.";
  }

  const sentFollowup = sorted.find((item) => {
    const ageDays = daysBetween(item.at, now);
    return ["message_sent", "nurture_step_sent"].includes(String(item.event.event_type || "")) && ageDays >= 3 && ageDays <= 14;
  });
  if (sentFollowup) {
    const text = eventText(sentFollowup.event);
    if (!/stopp|ikke aktuelt|not interested|unsubscribe/.test(text)) {
      return "Det er sendt oppfølging uten registrert svar. Send en kort, personlig check-in eller ring kunden.";
    }
  }

  return null;
}

export function scoreRevenueMemorySignals(
  events: RevenueMemoryEventInput[] | null | undefined,
  now = new Date(),
): RevenueMemoryScore {
  const reasons: string[] = [];
  let score = 0;
  const sorted = [...(events || [])]
    .map((event) => ({ event, at: eventTime(event) }))
    .filter((item): item is { event: RevenueMemoryEventInput; at: Date } => Boolean(item.at))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const recentInbound = sorted.find((item) => item.event.event_type === "email_received" && daysBetween(item.at, now) <= 3);
  if (recentInbound) {
    score += 22;
    reasons.push("kunden svarte nylig");
  }

  const bookedMeeting = sorted.find((item) => item.event.event_type === "meeting_booked" && daysBetween(item.at, now) <= 14);
  if (bookedMeeting) {
    score += 18;
    reasons.push("møte er booket");
  }

  const recentPortalMessage = sorted.find((item) => eventSourceType(item.event) === "customer_message" && daysBetween(item.at, now) <= 3);
  if (recentPortalMessage) {
    score += 34;
    reasons.push("kundemelding på Min side");
  }

  const recentPreferenceUpdate = sorted.find((item) => eventSourceType(item.event) === "preferences_updated" && daysBetween(item.at, now) <= 7);
  if (recentPreferenceUpdate) {
    score += 30;
    reasons.push("kunden oppdaterte boligønsker på Min side");
  }

  const propertyPdfSent = sorted.find((item) => (
    item.event.event_type === "message_sent"
    && eventSourceSystem(item.event) === "property_pdf"
    && daysBetween(item.at, now) <= 14
  ));
  if (propertyPdfSent) {
    score += 12;
    reasons.push("konkret prospekt sendt");
  }

  const sentWithoutReply = sorted.find((item) => {
    const ageDays = daysBetween(item.at, now);
    if (!["message_sent", "nurture_step_sent"].includes(String(item.event.event_type || ""))) return false;
    if (ageDays < 3 || ageDays > 14) return false;
    const text = eventText(item.event);
    return !/stopp|ikke aktuelt|not interested|unsubscribe/.test(text);
  });
  if (sentWithoutReply && !recentInbound) {
    score += 9;
    reasons.push("oppfølging sendt uten registrert svar");
  }

  const hotText = sorted
    .filter((item) => daysBetween(item.at, now) <= 14)
    .map((item) => eventText(item.event))
    .join(" ");
  if (/reservasjon|reserve|reservation|tilbud|offer|klar|ready|finansiering|mortgage|reise|flight/.test(hotText)) {
    score += 10;
    reasons.push("sterkt kjøpssignal i kundeminne");
  }

  if (/stopp|ikke aktuelt|not interested|unsubscribe/.test(hotText)) {
    score -= 25;
    reasons.push("negativt signal i kundeminne");
  }

  return {
    score: Math.max(-25, Math.min(40, score)),
    reasons,
  };
}

export function scoreRevenueContact(contact: RevenueContactInput, now = new Date()) {
  const stage = normalizeStage(contact.pipeline_status);
  const stageScore: Record<string, number> = {
    NEW: 24,
    CONTACT: 32,
    QUALIFIED: 50,
    VIEWING: 68,
    NEGOTIATION: 82,
    ON_HOLD: 14,
  };

  let score = stageScore[stage] ?? 20;
  const value = Number(contact.pipeline_value || 0);
  if (value >= 750_000) score += 18;
  else if (value >= 500_000) score += 14;
  else if (value >= 250_000) score += 10;
  else if (value > 0) score += 5;

  const existingSignal = Math.max(
    Number(contact.buying_signal_score || 0),
    Number(contact.purchase_signal_score || 0),
  );
  if (existingSignal > 0) score += Math.min(15, Math.round(existingSignal / 7));

  const text = `${contact.notes || ""} ${interactionText(contact.interactions)}`;
  score += signalScoreFromText(text);

  const nextFollowup = safeDate(contact.next_followup);
  const isOverdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime());
  if (isOverdue) score += CLOSING_STAGES.has(stage) ? 24 : 16;
  if (!nextFollowup) score += 10;

  const lastContact = safeDate(contact.last_contact || contact.updated_at);
  if (lastContact) {
    const staleDays = daysBetween(lastContact, now);
    if (staleDays >= 14) score += CLOSING_STAGES.has(stage) ? 20 : 12;
    else if (staleDays >= 7) score += 8;
    else if (staleDays <= 2) score += 5;
  }

  if (contact.email && contact.phone) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function recommendRevenueAction(
  contact: RevenueContactInput,
  now = new Date(),
  context: RevenueRecommendationContext = {},
) {
  const stage = normalizeStage(contact.pipeline_status);
  const nextFollowup = safeDate(contact.next_followup);
  const overdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime());

  if (!contact.email && !contact.phone) {
    return "Finn en gyldig kontaktkanal før leadet går tapt.";
  }

  const memoryAction = recommendActionFromRevenueMemory(context.revenueEvents, now);
  if (memoryAction) return overdue ? `Oppfølgingen er forsinket. ${memoryAction}` : memoryAction;

  const stageActions: Record<string, string> = {
    NEW: "Svar personlig og avklar budsjett, område, boligtype og tidslinje.",
    CONTACT: "Få kjøperprofilen komplett og book en kort rådgivningssamtale.",
    QUALIFIED: "Kjør property matching og send 3–5 kvalitetssikrede alternativer.",
    VIEWING: "Bekreft visningsplan, beslutningstakere og kundens viktigste innsigelser.",
    NEGOTIATION: "Avklar siste beslutningshinder og avtal konkret neste steg mot reservasjon.",
    ON_HOLD: "Bekreft om timing, budsjett eller behov har endret seg før saken parkeres videre.",
  };

  const action = stageActions[stage] || "Kontakt kunden og avtal neste konkrete steg.";
  return overdue ? `Oppfølgingen er forsinket. ${action}` : action;
}

export function buildRevenuePriority(
  contact: RevenueContactInput,
  now = new Date(),
  context: RevenueRecommendationContext = {},
): RevenuePriorityItem | null {
  const stage = normalizeStage(contact.pipeline_status);
  if (!ACTIVE_STAGES.has(stage)) return null;

  const memoryScore = scoreRevenueMemorySignals(context.revenueEvents, now);
  const score = Math.max(0, Math.min(100, scoreRevenueContact(contact, now) + memoryScore.score));
  const nextFollowup = safeDate(contact.next_followup);
  const createdAt = safeDate(contact.created_at);
  const lastContact = safeDate(contact.last_contact || contact.updated_at);
  const isOverdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime());
  const isNew = stage === "NEW" && (!createdAt || daysBetween(createdAt, now) <= 7);
  const isClosing = CLOSING_STAGES.has(stage);

  let kind: RevenuePriorityKind = "followup";
  if (isClosing) kind = "closing";
  else if (isOverdue) kind = "overdue";
  else if (isNew) kind = "new";
  else if (score >= 70) kind = "hot";

  let priority: RevenuePriorityLevel = "LOW";
  if ((isClosing && isOverdue) || score >= 90) priority = "CRITICAL";
  else if (isOverdue || isClosing || score >= 75) priority = "HIGH";
  else if (score >= 50) priority = "MEDIUM";

  const reasons: string[] = [];
  if (isClosing) reasons.push(`aktiv ${stage === "NEGOTIATION" ? "forhandling" : "visningsfase"}`);
  if (isOverdue) reasons.push("oppfølging er forfalt");
  if (!nextFollowup) reasons.push("mangler neste oppfølgingsdato");
  if (Number(contact.pipeline_value || 0) >= 500_000) reasons.push("høy potensiell verdi");
  if (lastContact && daysBetween(lastContact, now) >= 7) reasons.push("ingen nylig kontakt");
  reasons.push(...memoryScore.reasons);
  if (reasons.length === 0) reasons.push("bør følges opp etter kjøpssignal og pipeline-status");

  return {
    id: contact.id,
    contactName: String(contact.name || contact.email || "Ukjent kunde"),
    email: contact.email || null,
    phone: contact.phone || null,
    brandId: String(contact.brand_id || contact.brand || "zeneco"),
    source: contact.source || null,
    stage,
    value: Number(contact.pipeline_value || 0),
    propertyInterest: contact.property_interest || null,
    kind,
    priority,
    score,
    reason: reasons.join(" · "),
    recommendedAction: recommendRevenueAction(contact, now, context),
    lastContactAt: lastContact?.toISOString() || null,
    nextFollowupAt: nextFollowup?.toISOString() || null,
    createdAt: createdAt?.toISOString() || null,
    isOverdue,
    isMissingNextAction: !nextFollowup,
    href: `/pipeline?contactId=${encodeURIComponent(contact.id)}`,
  };
}

export function sortRevenuePriorities(items: RevenuePriorityItem[]) {
  const priorityWeight: Record<RevenuePriorityLevel, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  return [...items].sort((a, b) => {
    const priorityDelta = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDelta !== 0) return priorityDelta;
    if (b.score !== a.score) return b.score - a.score;
    return b.value - a.value;
  });
}
