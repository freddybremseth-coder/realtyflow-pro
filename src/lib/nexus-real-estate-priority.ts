import {
  buildRevenuePriority,
  type RevenueContactInput,
  type RevenuePriorityItem,
  type RevenueRecommendationContext,
} from "@/lib/revenue/today";

const EXTENDED_STAGES = new Set(["MATCHING", "RESERVED"]);

function normalizedStage(value: unknown) {
  return String(value || "NEW").trim().toUpperCase() || "NEW";
}

function matchingPriority(
  contact: RevenueContactInput,
  now: Date,
  context: RevenueRecommendationContext,
): RevenuePriorityItem | null {
  const proxy = buildRevenuePriority({ ...contact, pipeline_status: "QUALIFIED" }, now, context);
  if (!proxy) return null;
  const score = Math.max(60, proxy.score);
  return {
    ...proxy,
    stage: "MATCHING",
    score,
    kind: score >= 70 ? "hot" : "followup",
    priority: score >= 90 ? "CRITICAL" : score >= 75 ? "HIGH" : "MEDIUM",
    reason: proxy.reason.includes("boligmatching") ? proxy.reason : `${proxy.reason} · aktiv boligmatching`,
    recommendedAction: proxy.isOverdue
      ? "Oppfølgingen er forsinket. Kjør property matching mot godkjent Buyer Profile, kvalitetssikre shortlist og avklar neste konkrete steg med kunden."
      : "Kjør property matching mot godkjent Buyer Profile og klargjør 3–5 kvalitetssikrede boliger for review før kundekontakt.",
  };
}

function reservedPriority(
  contact: RevenueContactInput,
  now: Date,
  context: RevenueRecommendationContext,
): RevenuePriorityItem | null {
  const proxy = buildRevenuePriority({ ...contact, pipeline_status: "NEGOTIATION" }, now, context);
  if (!proxy) return null;
  const score = Math.max(82, proxy.score);
  return {
    ...proxy,
    stage: "RESERVED",
    score,
    kind: "closing",
    priority: proxy.isOverdue || score >= 90 ? "CRITICAL" : "HIGH",
    reason: proxy.reason.includes("reservert") ? proxy.reason : `${proxy.reason} · bolig reservert / closing pågår`,
    recommendedAction: proxy.isOverdue
      ? "Oppfølgingen er forsinket. Kontroller reservasjon, dokumenter, betalinger, advokat og konkret closing-plan i dag."
      : "Følg reservasjon, dokumenter, betalinger, advokat og closing-plan til neste avtalte milepæl.",
  };
}

/**
 * Canonical real-estate priority adapter while legacy Revenue Today still has a
 * narrower stage list. It preserves all existing scoring/memory behavior and
 * adds explicit MATCHING/RESERVED semantics instead of letting those customers
 * disappear or fall back to a new-lead opportunity.
 */
export function buildCanonicalRealEstatePriority(
  contact: RevenueContactInput,
  now = new Date(),
  context: RevenueRecommendationContext = {},
): RevenuePriorityItem | null {
  const stage = normalizedStage(contact.pipeline_status);
  if (stage === "MATCHING") return matchingPriority(contact, now, context);
  if (stage === "RESERVED") return reservedPriority(contact, now, context);
  if (EXTENDED_STAGES.has(stage)) return null;
  return buildRevenuePriority(contact, now, context);
}
