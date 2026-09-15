import {
  buildRevenuePriority,
  scoreRevenueMemorySignals,
  type RevenueContactInput,
  type RevenuePriorityItem,
  type RevenuePriorityLevel,
  type RevenueRecommendationContext,
} from "@/lib/revenue/today";
import {
  commissionPriorityBonus,
  commissionTruthReason,
  deriveCommissionTruth,
  type CommissionTruthInput,
  type CommissionTruthSource,
} from "@/lib/revenue/commission-truth";

const EXTENDED_STAGES = new Set(["MATCHING", "RESERVED"]);
const COMMISSION_EXPECTED_STAGES = new Set(["QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED"]);
const STRONG_BEHAVIORAL_SIGNAL_FLOOR = 75;

export type CanonicalRealEstateContactInput = RevenueContactInput & CommissionTruthInput;

export type CanonicalRealEstatePriority = RevenuePriorityItem & {
  transactionValue: number;
  commissionRevenue: number | null;
  commissionPercent: number | null;
  commissionKnown: boolean;
  commissionSource: CommissionTruthSource;
};

function normalizedStage(value: unknown) {
  return String(value || "NEW").trim().toUpperCase() || "NEW";
}

function priorityForScore(item: RevenuePriorityItem, score: number): RevenuePriorityLevel {
  if ((item.kind === "closing" && item.isOverdue) || score >= 90) return "CRITICAL";
  if (item.isOverdue || item.kind === "closing" || score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

function commissionNativeBasePriority(
  contact: CanonicalRealEstateContactInput,
  now: Date,
  context: RevenueRecommendationContext,
  stageOverride?: string,
): CanonicalRealEstatePriority | null {
  const stage = normalizedStage(stageOverride || contact.pipeline_status);
  const truth = deriveCommissionTruth(contact);

  // Legacy Revenue Today historically uses pipeline_value both as the displayed
  // transaction value and as a priority bonus. Real-estate priority must not
  // confuse property/deal value with our revenue, so neutralize it for scoring
  // and restore it only as transaction information afterwards.
  const base = buildRevenuePriority({
    ...contact,
    pipeline_status: stageOverride || contact.pipeline_status,
    pipeline_value: 0,
  }, now, context);
  if (!base) return null;

  // Strong, fresh customer behavior is commercially urgent in its own right.
  // Preserve that urgency after removing the old property-price bonus: a
  // strongly evidenced recent reply / booking / portal signal can reach HIGH,
  // but transaction value alone never can.
  const memory = scoreRevenueMemorySignals(context.revenueEvents, now);
  const behavioralFloor = memory.score >= 30 ? STRONG_BEHAVIORAL_SIGNAL_FLOOR : 0;
  const score = Math.max(
    behavioralFloor,
    Math.max(0, Math.min(100, base.score + commissionPriorityBonus(truth))),
  );
  const reasonParts = [base.reason];
  if (truth.commissionKnown || COMMISSION_EXPECTED_STAGES.has(stage)) {
    reasonParts.push(commissionTruthReason(truth));
  }

  return {
    ...base,
    value: truth.transactionValue,
    transactionValue: truth.transactionValue,
    commissionRevenue: truth.commissionRevenue,
    commissionPercent: truth.commissionPercent,
    commissionKnown: truth.commissionKnown,
    commissionSource: truth.source,
    score,
    kind: base.kind === "followup" && score >= 70 ? "hot" : base.kind,
    priority: priorityForScore(base, score),
    reason: reasonParts.join(" · "),
  };
}

function matchingPriority(
  contact: CanonicalRealEstateContactInput,
  now: Date,
  context: RevenueRecommendationContext,
): CanonicalRealEstatePriority | null {
  const proxy = commissionNativeBasePriority(contact, now, context, "QUALIFIED");
  if (!proxy) return null;
  const score = Math.max(60, proxy.score);
  return {
    ...proxy,
    stage: "MATCHING",
    score,
    kind: score >= 70 ? "hot" : "followup",
    priority: score >= 90 ? "CRITICAL" : proxy.isOverdue || score >= 75 ? "HIGH" : "MEDIUM",
    reason: proxy.reason.includes("boligmatching") ? proxy.reason : `${proxy.reason} · aktiv boligmatching`,
    recommendedAction: proxy.isOverdue
      ? "Oppfølgingen er forsinket. Kjør property matching mot godkjent Buyer Profile, kvalitetssikre shortlist og avklar neste konkrete steg med kunden."
      : "Kjør property matching mot godkjent Buyer Profile og klargjør 3–5 kvalitetssikrede boliger for review før kundekontakt.",
  };
}

function reservedPriority(
  contact: CanonicalRealEstateContactInput,
  now: Date,
  context: RevenueRecommendationContext,
): CanonicalRealEstatePriority | null {
  const proxy = commissionNativeBasePriority(contact, now, context, "NEGOTIATION");
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
 * Canonical real-estate priority adapter. Transaction value remains visible as
 * deal context, but only explicit commission amount/rate can add economic
 * priority. No fallback commission is promoted to revenue truth.
 */
export function buildCanonicalRealEstatePriority(
  contact: CanonicalRealEstateContactInput,
  now = new Date(),
  context: RevenueRecommendationContext = {},
): CanonicalRealEstatePriority | null {
  const stage = normalizedStage(contact.pipeline_status);
  if (stage === "MATCHING") return matchingPriority(contact, now, context);
  if (stage === "RESERVED") return reservedPriority(contact, now, context);
  if (EXTENDED_STAGES.has(stage)) return null;
  return commissionNativeBasePriority(contact, now, context);
}

export function sortCanonicalRealEstatePriorities<T extends CanonicalRealEstatePriority>(items: T[]) {
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
    const commissionDelta = (b.commissionRevenue || 0) - (a.commissionRevenue || 0);
    if (commissionDelta !== 0) return commissionDelta;
    return a.id.localeCompare(b.id);
  });
}
