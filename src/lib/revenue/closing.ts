export type ClosingStage = "QUALIFIED" | "VIEWING" | "NEGOTIATION";

export interface ClosingContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  property_interest?: string | null;
  notes?: string | null;
  interactions?: Array<{ content?: string | null; type?: string | null; date?: string | null }> | null;
  brand_id?: string | null;
  brand?: string | null;
  last_contact?: string | null;
  next_followup?: string | null;
  updated_at?: string | null;
}

export interface ClosingChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  critical: boolean;
}

export interface ClosingOpportunity {
  id: string;
  name: string;
  stage: ClosingStage;
  brandId: string;
  value: number;
  propertyInterest: string | null;
  email: string | null;
  phone: string | null;
  nextFollowupAt: string | null;
  risk: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  blockers: string[];
  checklist: ClosingChecklistItem[];
  nextAction: string;
  href: string;
}

function text(contact: ClosingContact) {
  return [contact.notes, contact.property_interest, ...(contact.interactions || []).map((item) => item.content)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function has(haystack: string, pattern: RegExp) {
  return pattern.test(haystack);
}

function overdue(value: string | null | undefined, now: Date) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < now.getTime();
}

export function buildClosingOpportunity(contact: ClosingContact, now = new Date()): ClosingOpportunity | null {
  const stage = String(contact.pipeline_status || "").toUpperCase();
  if (!["QUALIFIED", "VIEWING", "NEGOTIATION"].includes(stage)) return null;

  const haystack = text(contact);
  const hasBudget = Number(contact.pipeline_value || 0) > 0 || has(haystack, /budsjett|budget|finansiering|financing/);
  const hasArea = Boolean(contact.property_interest) || has(haystack, /område|area|altea|albir|benidorm|finestrat|pinoso|moraira|calpe/);
  const hasTimeline = has(haystack, /innen|måned|uke|timeline|nå|now|2026|2027/);
  const hasDecisionMakers = has(haystack, /ektefelle|partner|wife|husband|begge|decision maker/);
  const hasViewing = stage !== "QUALIFIED" || has(haystack, /visning|viewing|besøk|visit/);
  const hasPreferredProperty = stage === "NEGOTIATION" || has(haystack, /favoritt|preferred|førstevalg|best likte|ønsker denne/);
  const hasLegal = has(haystack, /advokat|lawyer|legal|due diligence|nie|notar/);
  const hasFinance = has(haystack, /finansiering|mortgage|bank|valuta|currency|egenkapital|cash buyer/);
  const hasReservation = has(haystack, /reservasjon|reservation|depositum|deposit|tilbud|offer/);

  const checklist: ClosingChecklistItem[] = [
    { id: "budget", label: "Budsjett og finansiering avklart", complete: hasBudget, critical: true },
    { id: "area", label: "Område og boligtype bekreftet", complete: hasArea, critical: true },
    { id: "timeline", label: "Kjøpstidslinje bekreftet", complete: hasTimeline, critical: true },
    { id: "decision-makers", label: "Alle beslutningstakere involvert", complete: hasDecisionMakers, critical: false },
    { id: "viewing", label: "Visning planlagt eller gjennomført", complete: hasViewing, critical: stage !== "QUALIFIED" },
    { id: "preferred-property", label: "Foretrukket bolig identifisert", complete: hasPreferredProperty, critical: stage === "NEGOTIATION" },
    { id: "legal", label: "Advokat og juridisk prosess avklart", complete: hasLegal, critical: stage === "NEGOTIATION" },
    { id: "finance", label: "Betalingsmåte og valuta avklart", complete: hasFinance, critical: stage === "NEGOTIATION" },
    { id: "reservation", label: "Reservasjon eller tilbud diskutert", complete: hasReservation, critical: stage === "NEGOTIATION" },
  ];

  const blockers = checklist.filter((item) => item.critical && !item.complete).map((item) => item.label);
  const isOverdue = overdue(contact.next_followup, now);
  let score = stage === "NEGOTIATION" ? 70 : stage === "VIEWING" ? 55 : 40;
  score += checklist.filter((item) => item.complete).length * 4;
  score += Number(contact.pipeline_value || 0) >= 500_000 ? 8 : 0;
  score -= blockers.length * 5;
  score -= isOverdue ? 8 : 0;
  score = Math.max(0, Math.min(100, score));

  const risk: ClosingOpportunity["risk"] = isOverdue || blockers.length >= 3 ? "HIGH" : blockers.length >= 1 ? "MEDIUM" : "LOW";
  const nextAction = isOverdue
    ? "Kontakt kunden i dag og avtal ett konkret neste steg."
    : blockers[0]
      ? `Avklar: ${blockers[0]}.`
      : stage === "NEGOTIATION"
        ? "Be om beslutning på reservasjon eller konkret tilbud."
        : stage === "VIEWING"
          ? "Oppsummer visningen og identifiser kundens førstevalg."
          : "Bekreft kjøperprofil og bygg en kort, godkjent shortlist.";

  return {
    id: contact.id,
    name: contact.name || contact.email || "Ukjent kunde",
    stage: stage as ClosingStage,
    brandId: contact.brand_id || contact.brand || "zeneco",
    value: Number(contact.pipeline_value || 0),
    propertyInterest: contact.property_interest || null,
    email: contact.email || null,
    phone: contact.phone || null,
    nextFollowupAt: contact.next_followup || null,
    risk,
    score,
    blockers,
    checklist,
    nextAction,
    href: `/pipeline?contactId=${encodeURIComponent(contact.id)}`,
  };
}

export function sortClosingOpportunities(items: ClosingOpportunity[]) {
  const riskWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...items].sort((a, b) => riskWeight[b.risk] - riskWeight[a.risk] || b.score - a.score || b.value - a.value);
}
