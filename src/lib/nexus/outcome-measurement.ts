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

function recommendationMetadata(event: NexusOutcomeEventRow) {
  return event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
}

function summarize(rows: NexusRecommendationOutcome[]) {
  const has = (row: NexusRecommendationOutcome, types: string[]) => types.includes(String(row.strongestOutcomeType || "")) || types.includes(String(row.firstOutcomeType || ""));
  const withOutcome = rows.filter((row) => row.firstOutcomeType).length;
  const replies = rows.filter((row) => has(row, ["email_received"])).length;
  const viewings = rows.filter((row) => has(row, ["viewing_scheduled", "viewing_completed"])).length;
  const offers = rows.filter((row) => has(row, ["offer_made"])).length;
  const wins = rows.filter((row) => has(row, ["deal_won", "commission_paid"])).length;
  return {
    recommendations: rows.length,
    withOutcome,
    outcomeRate: pct(withOutcome, rows.length),
    replyRate: pct(replies, rows.length),
    viewingRate: pct(viewings, rows.length),
    offerRate: pct(offers, rows.length),
    winRate: pct(wins, rows.length),
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
  const outcomeEvents = events.filter((event) => NEXUS_OUTCOME_EVENT_TYPES.includes(String(event.event_type) as (typeof NEXUS_OUTCOME_EVENT_TYPES)[number]));

  const recommendations = recommendationEvents.map((recommendation): NexusRecommendationOutcome => {
    const metadata = recommendationMetadata(recommendation);
    const recommendedAt = text(recommendation.occurred_at || recommendation.created_at) || now.toISOString();
    const recommendedMs = time(recommendedAt) ?? now.getTime();
    const contactId = text(recommendation.contact_id) || null;
    const candidates = contactId
      ? outcomeEvents
          .filter((event) => text(event.contact_id) === contactId)
          .filter((event) => {
            const eventMs = time(event.occurred_at || event.created_at);
            return eventMs !== null && eventMs >= recommendedMs && eventMs <= recommendedMs + windowMs;
          })
          .sort((a, b) => (time(a.occurred_at || a.created_at) ?? 0) - (time(b.occurred_at || b.created_at) ?? 0))
      : [];
    const first = candidates[0] ?? null;
    const strongest = [...candidates].sort((a, b) => (OUTCOME_WEIGHT[String(b.event_type)] || 0) - (OUTCOME_WEIGHT[String(a.event_type)] || 0))[0] ?? null;
    const firstMs = first ? time(first.occurred_at || first.created_at) : null;
    return {
      recommendationId: text(metadata.recommendation_id) || text(recommendation.source_id) || text(recommendation.id),
      contactId,
      actionType: text(metadata.action_type) || "unknown",
      policyClass: text(metadata.policy_class) || "unknown",
      source: text(metadata.revenue_source) || "unknown",
      recommendedAt,
      opportunityScore: number(metadata.opportunity_score),
      expectedValueEur: number(metadata.expected_value_eur),
      firstOutcomeType: first ? text(first.event_type) : null,
      strongestOutcomeType: strongest ? text(strongest.event_type) : null,
      firstOutcomeAt: first ? text(first.occurred_at || first.created_at) : null,
      hoursToFirstOutcome: firstMs === null ? null : Math.round(((firstMs - recommendedMs) / 3_600_000) * 10) / 10,
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
