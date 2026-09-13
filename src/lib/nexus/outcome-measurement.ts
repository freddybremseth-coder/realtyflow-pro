import type { RevenueBrainSnapshot } from "@/lib/nexus/revenue-brain";
import { buildRevenueEventDedupeKey, insertRevenueEvent, type RevenueEventsSupabaseLike } from "@/lib/revenue/events";

export const NEXUS_OUTCOME_EVENT_TYPES = [
  "email_received",
  "property_interested",
  "property_not_for_me",
  "meeting_booked",
  "viewing_scheduled",
  "viewing_completed",
  "offer_made",
  "deal_won",
  "deal_lost",
  "commission_paid",
] as const;

const OUTCOME_WEIGHT: Record<string, number> = {
  email_received: 10,
  property_not_for_me: 12,
  property_interested: 20,
  meeting_booked: 30,
  viewing_scheduled: 40,
  viewing_completed: 50,
  offer_made: 70,
  deal_lost: 75,
  deal_won: 90,
  commission_paid: 100,
};

export interface NexusOutcomeEventRow {
  id?: string | null;
  title?: string | null;
  event_type?: string | null;
  contact_id?: string | null;
  brand_id?: string | null;
  source_system?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  revenue_impact_eur?: number | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface NexusRecommendationOutcome {
  recommendationId: string;
  contactId: string | null;
  actionType: string;
  policyClass: string;
  source: string;
  recommendedAt: string;
  opportunityScore: number;
  expectedValueEur: number;
  executed: boolean;
  executionEventId: string | null;
  executedAt: string | null;
  hoursToExecution: number | null;
  firstOutcomeType: string | null;
  strongestOutcomeType: string | null;
  firstOutcomeAt: string | null;
  hoursToFirstOutcome: number | null;
  revenueImpactEur: number;
}

export interface NexusOutcomeMeasurement {
  generatedAt: string;
  attributionWindowDays: number;
  recommendations: NexusRecommendationOutcome[];
  summary: {
    recommendations: number;
    executed: number;
    executionRate: number;
    withOutcome: number;
    outcomeRate: number;
    replyRate: number;
    viewingRate: number;
    offerRate: number;
    winRate: number;
    revenueImpactEur: number;
    medianHoursToFirstOutcome: number | null;
  };
  byActionType: Array<{
    actionType: string;
    recommendations: number;
    executed: number;
    executionRate: number;
    withOutcome: number;
    outcomeRate: number;
    replyRate: number;
    viewingRate: number;
    offerRate: number;
    winRate: number;
    revenueImpactEur: number;
  }>;
  safety: {
    observationalOnly: true;
    executedActionEvidenceRequired: true;
    singleRecommendationOutcomeOwnership: true;
    policyMutationAllowed: false;
    autonomyExpansionAllowed: false;
  };
}

function text(value: unknown) {
  return String(value || "").trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function time(value: unknown) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? Math.round(sorted[middle] * 10) / 10 : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

function isRecommendation(event: NexusOutcomeEventRow) {
  return event.event_type === "automation_recommended" && event.source_system === "nexus_revenue_brain";
}

function eventMetadata(event: NexusOutcomeEventRow) {
  return event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
}

function recommendationId(event: NexusOutcomeEventRow) {
  const metadata = eventMetadata(event);
  return text(metadata.recommendation_id) || text(event.source_id) || text(event.id);
}

function isExecution(event: NexusOutcomeEventRow) {
  return event.event_type === "automation_executed"
    && event.source_system === "nexus_revenue_brain"
    && text(eventMetadata(event).recommendation_id).length > 0;
}

function recommendationMetadata(event: NexusOutcomeEventRow) {
  return event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
}

function summarize(rows: NexusRecommendationOutcome[]) {
  const has = (row: NexusRecommendationOutcome, types: string[]) => types.includes(String(row.strongestOutcomeType || "")) || types.includes(String(row.firstOutcomeType || ""));
  const withOutcome = rows.filter((row) => row.firstOutcomeType).length;
  const executed = rows.filter((row) => row.executed).length;
  const replies = rows.filter((row) => has(row, ["email_received"])).length;
  const viewings = rows.filter((row) => has(row, ["viewing_scheduled", "viewing_completed"])).length;
  const offers = rows.filter((row) => has(row, ["offer_made"])).length;
  const wins = rows.filter((row) => has(row, ["deal_won", "commission_paid"])).length;
  return {
    recommendations: rows.length,
    executed,
    executionRate: pct(executed, rows.length),
    withOutcome,
    outcomeRate: pct(withOutcome, executed),
    replyRate: pct(replies, executed),
    viewingRate: pct(viewings, executed),
    offerRate: pct(offers, executed),
    winRate: pct(wins, executed),
    revenueImpactEur: Math.round(rows.reduce((sum, row) => sum + row.revenueImpactEur, 0)),
  };
}

export function measureRevenueBrainOutcomes(
  events: NexusOutcomeEventRow[],
  options: { now?: Date; attributionWindowDays?: number } = {},
): NexusOutcomeMeasurement {
  const now = options.now ?? new Date();
  const attributionWindowDays = Math.max(1, Math.min(90, options.attributionWindowDays ?? 30));
  const windowMs = attributionWindowDays * 86_400_000;
  const recommendationEvents = events.filter(isRecommendation);
  const executionEvents = events.filter(isExecution);
  const outcomeEvents = events.filter((event) => NEXUS_OUTCOME_EVENT_TYPES.includes(String(event.event_type) as (typeof NEXUS_OUTCOME_EVENT_TYPES)[number]));

  // Revenue Brain snapshots repeat while an action remains open. Treat the
  // stable recommendation id as one signal, retaining its first observation.
  const uniqueRecommendations = new Map<string, NexusOutcomeEventRow>();
  for (const event of [...recommendationEvents].sort((a, b) => (time(a.occurred_at || a.created_at) ?? 0) - (time(b.occurred_at || b.created_at) ?? 0))) {
    const id = recommendationId(event);
    if (id && !uniqueRecommendations.has(id)) uniqueRecommendations.set(id, event);
  }

  const executionByRecommendation = new Map<string, NexusOutcomeEventRow>();
  for (const event of [...executionEvents].sort((a, b) => (time(a.occurred_at || a.created_at) ?? 0) - (time(b.occurred_at || b.created_at) ?? 0))) {
    const id = recommendationId(event);
    const recommendation = uniqueRecommendations.get(id);
    const executionMs = time(event.occurred_at || event.created_at);
    const recommendationMs = recommendation ? time(recommendation.occurred_at || recommendation.created_at) : null;
    if (recommendation && executionMs !== null && recommendationMs !== null && executionMs >= recommendationMs && !executionByRecommendation.has(id)) {
      executionByRecommendation.set(id, event);
    }
  }

  // Every outcome has at most one owner. Explicit recommendation linkage wins;
  // otherwise the most recently executed eligible action for that contact owns it.
  const outcomeOwner = new Map<NexusOutcomeEventRow, string>();
  for (const outcome of outcomeEvents) {
    const outcomeMs = time(outcome.occurred_at || outcome.created_at);
    if (outcomeMs === null) continue;
    const explicitId = text(eventMetadata(outcome).recommendation_id);
    const eligible = [...executionByRecommendation.entries()].filter(([id, execution]) => {
      const executionMs = time(execution.occurred_at || execution.created_at);
      const recommendation = uniqueRecommendations.get(id);
      if (!recommendation || executionMs === null || outcomeMs < executionMs || outcomeMs > executionMs + windowMs) return false;
      if (explicitId) return id === explicitId;
      const sameContact = text(outcome.contact_id) && text(outcome.contact_id) === text(recommendation.contact_id);
      const sameBrand = !text(outcome.brand_id) || !text(recommendation.brand_id) || text(outcome.brand_id) === text(recommendation.brand_id);
      return Boolean(sameContact && sameBrand);
    });
    eligible.sort((a, b) => (time(b[1].occurred_at || b[1].created_at) ?? 0) - (time(a[1].occurred_at || a[1].created_at) ?? 0) || a[0].localeCompare(b[0]));
    if (eligible[0]) outcomeOwner.set(outcome, eligible[0][0]);
  }

  const recommendations = [...uniqueRecommendations.values()].map((recommendation): NexusRecommendationOutcome => {
    const metadata = recommendationMetadata(recommendation);
    const recommendedAt = text(recommendation.occurred_at || recommendation.created_at) || now.toISOString();
    const recommendedMs = time(recommendedAt) ?? now.getTime();
    const id = recommendationId(recommendation);
    const contactId = text(recommendation.contact_id) || null;
    const execution = executionByRecommendation.get(id) ?? null;
    const executedAt = execution ? text(execution.occurred_at || execution.created_at) : null;
    const executedMs = executedAt ? time(executedAt) : null;
    const candidates = outcomeEvents
      .filter((event) => outcomeOwner.get(event) === id)
      .sort((a, b) => (time(a.occurred_at || a.created_at) ?? 0) - (time(b.occurred_at || b.created_at) ?? 0));
    const first = candidates[0] ?? null;
    const strongest = [...candidates].sort((a, b) => (OUTCOME_WEIGHT[String(b.event_type)] || 0) - (OUTCOME_WEIGHT[String(a.event_type)] || 0))[0] ?? null;
    const firstMs = first ? time(first.occurred_at || first.created_at) : null;
    return {
      recommendationId: id,
      contactId,
      actionType: text(metadata.action_type) || "unknown",
      policyClass: text(metadata.policy_class) || "unknown",
      source: text(metadata.revenue_source) || "unknown",
      recommendedAt,
      opportunityScore: number(metadata.opportunity_score),
      expectedValueEur: number(metadata.expected_value_eur),
      executed: Boolean(execution),
      executionEventId: execution ? text(execution.id) || null : null,
      executedAt,
      hoursToExecution: executedMs === null ? null : Math.round(((executedMs - recommendedMs) / 3_600_000) * 10) / 10,
      firstOutcomeType: first ? text(first.event_type) : null,
      strongestOutcomeType: strongest ? text(strongest.event_type) : null,
      firstOutcomeAt: first ? text(first.occurred_at || first.created_at) : null,
      hoursToFirstOutcome: firstMs === null || executedMs === null ? null : Math.round(((firstMs - executedMs) / 3_600_000) * 10) / 10,
      revenueImpactEur: Math.round(candidates.reduce((sum, event) => sum + number(event.revenue_impact_eur), 0)),
    };
  });

  const actionTypes = [...new Set(recommendations.map((row) => row.actionType))].sort();
  const byActionType = actionTypes.map((actionType) => ({ actionType, ...summarize(recommendations.filter((row) => row.actionType === actionType)) }));
  const base = summarize(recommendations);
  return {
    generatedAt: now.toISOString(),
    attributionWindowDays,
    recommendations,
    summary: {
      ...base,
      medianHoursToFirstOutcome: median(recommendations.map((row) => row.hoursToFirstOutcome).filter((value): value is number => value !== null)),
    },
    byActionType,
    safety: {
      observationalOnly: true,
      executedActionEvidenceRequired: true,
      singleRecommendationOutcomeOwnership: true,
      policyMutationAllowed: false,
      autonomyExpansionAllowed: false,
    },
  };
}

export async function recordRevenueBrainSnapshot(
  supabase: RevenueEventsSupabaseLike,
  brain: RevenueBrainSnapshot,
  options: { capturedAt?: Date; createdBy?: string } = {},
) {
  const capturedAt = options.capturedAt ?? new Date();
  const day = capturedAt.toISOString().slice(0, 10);
  const results = [];
  for (const action of brain.actions) {
    const result = await insertRevenueEvent(supabase, {
      eventType: "automation_recommended",
      title: `Nexus anbefaling: ${action.title}`,
      description: action.recommendedAction,
      contactId: action.contactId,
      sourceSystem: "nexus_revenue_brain",
      sourceType: "next_best_action",
      sourceId: action.id,
      actorType: "ai",
      confidenceScore: action.opportunityScore,
      occurredAt: capturedAt,
      dedupeKey: buildRevenueEventDedupeKey(["nexus-revenue-brain", day, action.id]),
      metadata: {
        recommendation_id: action.id,
        rank: action.rank,
        opportunity_score: action.opportunityScore,
        expected_value_eur: action.expectedValueEur,
        action_type: action.policyActionType,
        policy_class: action.policyClass,
        policy_reason: action.policyReason,
        revenue_source: action.source,
        href: action.href,
        generated_at: brain.generatedAt,
        automatic_execution_allowed: action.automaticExecutionAllowed,
        measurement_only: true,
      },
      createdBy: options.createdBy || "nexus-outcome-measurement",
    });
    results.push({ actionId: action.id, ...result });
  }
  return {
    attempted: brain.actions.length,
    recorded: results.filter((row) => row.ok && !row.duplicate).length,
    duplicates: results.filter((row) => row.ok && row.duplicate).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}

export async function recordRevenueBrainExecution(
  supabase: RevenueEventsSupabaseLike,
  recommendation: NexusOutcomeEventRow,
  options: { executedAt?: Date; actorId?: string; createdBy?: string } = {},
) {
  if (!isRecommendation(recommendation)) return { ok: false as const, error: "RECOMMENDATION_NOT_ELIGIBLE" };
  const metadata = recommendationMetadata(recommendation);
  const id = recommendationId(recommendation);
  const policyClass = text(metadata.policy_class);
  if (!id || !text(recommendation.contact_id)) return { ok: false as const, error: "RECOMMENDATION_IDENTITY_INCOMPLETE" };
  if (policyClass === "FORBIDDEN" || policyClass === "WAIT") return { ok: false as const, error: "RECOMMENDATION_POLICY_BLOCKED" };

  return insertRevenueEvent(supabase, {
    eventType: "automation_executed",
    title: `Nexus-anbefaling utført: ${text(recommendation.title) || id}`,
    description: "Menneskelig bekreftet utførelse av en Revenue Brain-anbefaling.",
    contactId: recommendation.contact_id,
    brandId: recommendation.brand_id,
    sourceSystem: "nexus_revenue_brain",
    sourceType: "next_best_action",
    sourceId: id,
    actorType: "human",
    actorId: options.actorId || "realtyflow-admin",
    occurredAt: options.executedAt ?? new Date(),
    dedupeKey: buildRevenueEventDedupeKey(["nexus-revenue-brain", "execution", id]),
    metadata: {
      recommendation_id: id,
      recommendation_event_id: text(recommendation.id) || null,
      action_type: text(metadata.action_type) || "unknown",
      policy_class: policyClass || "unknown",
      revenue_source: text(metadata.revenue_source) || "unknown",
      execution_evidence: "human_confirmed",
      feedback_contract: "executed_action_v1",
      automatic_execution: false,
    },
    createdBy: options.createdBy || "nexus-next-best-action-feedback",
  });
}
