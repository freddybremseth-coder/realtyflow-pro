import assert from "node:assert/strict";
import test from "node:test";
import { measureRevenueBrainOutcomes, recordRevenueBrainExecution, recordRevenueBrainSnapshot } from "./outcome-measurement";
import type { RevenueBrainSnapshot } from "./revenue-brain";

const now = new Date("2026-09-12T08:00:00.000Z");

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-event-1",
    event_type: "automation_recommended",
    contact_id: "contact-1",
    source_system: "nexus_revenue_brain",
    source_id: "action-1",
    occurred_at: "2026-09-01T08:00:00.000Z",
    metadata: {
      recommendation_id: "action-1",
      action_type: "general_customer_message",
      policy_class: "DRAFT_ONLY",
      revenue_source: "today",
      opportunity_score: 82,
      expected_value_eur: 10000,
    },
    ...overrides,
  };
}

function execution(recommendationId = "action-1", overrides: Record<string, unknown> = {}) {
  return {
    id: `execution-${recommendationId}`,
    event_type: "automation_executed",
    contact_id: "contact-1",
    source_system: "nexus_revenue_brain",
    source_id: recommendationId,
    occurred_at: "2026-09-01T09:00:00.000Z",
    metadata: { recommendation_id: recommendationId, execution_evidence: "human_confirmed" },
    ...overrides,
  };
}

test("attributes outcomes only after explicitly linked execution evidence", () => {
  const result = measureRevenueBrainOutcomes([
    recommendation(),
    execution(),
    { id: "reply", event_type: "email_received", contact_id: "contact-1", occurred_at: "2026-09-01T10:00:00.000Z" },
    { id: "viewing", event_type: "viewing_scheduled", contact_id: "contact-1", occurred_at: "2026-09-02T08:00:00.000Z" },
    { id: "offer", event_type: "offer_made", contact_id: "contact-1", occurred_at: "2026-09-05T08:00:00.000Z", revenue_impact_eur: 2500 },
  ], { now });

  assert.equal(result.summary.recommendations, 1);
  assert.equal(result.summary.executed, 1);
  assert.equal(result.summary.executionRate, 100);
  assert.equal(result.summary.withOutcome, 1);
  assert.equal(result.summary.outcomeRate, 100);
  assert.equal(result.recommendations[0]?.firstOutcomeType, "email_received");
  assert.equal(result.recommendations[0]?.strongestOutcomeType, "offer_made");
  assert.equal(result.recommendations[0]?.hoursToExecution, 1);
  assert.equal(result.recommendations[0]?.hoursToFirstOutcome, 1);
  assert.equal(result.recommendations[0]?.revenueImpactEur, 2500);
  assert.equal(result.safety.policyMutationAllowed, false);
  assert.equal(result.safety.autonomyExpansionAllowed, false);
  assert.equal(result.safety.executedActionEvidenceRequired, true);
});

test("does not attribute outcomes when the recommendation was never executed", () => {
  const result = measureRevenueBrainOutcomes([
    recommendation(),
    { event_type: "deal_won", contact_id: "contact-1", occurred_at: "2026-09-02T08:00:00.000Z" },
  ], { now, attributionWindowDays: 30 });

  assert.equal(result.summary.executed, 0);
  assert.equal(result.summary.withOutcome, 0);
  assert.equal(result.summary.outcomeRate, 0);
  assert.equal(result.recommendations[0]?.strongestOutcomeType, null);
});

test("aggregates learning by governed action type without changing policy", () => {
  const result = measureRevenueBrainOutcomes([
    recommendation(),
    recommendation({
      id: "rec-event-2",
      source_id: "action-2",
      contact_id: "contact-2",
      metadata: {
        recommendation_id: "action-2",
        action_type: "general_customer_message",
        policy_class: "DRAFT_ONLY",
        revenue_source: "recovery",
        opportunity_score: 70,
      },
    }),
    execution(),
    { event_type: "deal_won", contact_id: "contact-1", occurred_at: "2026-09-03T08:00:00.000Z", revenue_impact_eur: 15000 },
  ], { now });

  assert.equal(result.byActionType.length, 1);
  assert.equal(result.byActionType[0]?.actionType, "general_customer_message");
  assert.equal(result.byActionType[0]?.recommendations, 2);
  assert.equal(result.byActionType[0]?.executed, 1);
  assert.equal(result.byActionType[0]?.executionRate, 50);
  assert.equal(result.byActionType[0]?.winRate, 100);
  assert.equal(result.byActionType[0]?.revenueImpactEur, 15000);
});

test("credits one outcome to only the most recently executed recommendation", () => {
  const result = measureRevenueBrainOutcomes([
    recommendation(),
    recommendation({
      id: "rec-event-2",
      source_id: "action-2",
      occurred_at: "2026-09-01T08:30:00.000Z",
      metadata: { ...recommendation().metadata, recommendation_id: "action-2" },
    }),
    execution("action-1"),
    execution("action-2", { occurred_at: "2026-09-01T09:30:00.000Z" }),
    { id: "offer", event_type: "offer_made", contact_id: "contact-1", occurred_at: "2026-09-02T08:00:00.000Z", revenue_impact_eur: 5000 },
  ], { now });

  assert.equal(result.summary.executed, 2);
  assert.equal(result.summary.withOutcome, 1);
  assert.equal(result.summary.revenueImpactEur, 5000);
  assert.equal(result.recommendations.find((row) => row.recommendationId === "action-1")?.firstOutcomeType, null);
  assert.equal(result.recommendations.find((row) => row.recommendationId === "action-2")?.firstOutcomeType, "offer_made");
});

test("explicit outcome linkage overrides contact-time fallback", () => {
  const result = measureRevenueBrainOutcomes([
    recommendation(),
    recommendation({
      id: "rec-event-2",
      source_id: "action-2",
      occurred_at: "2026-09-01T08:30:00.000Z",
      metadata: { ...recommendation().metadata, recommendation_id: "action-2" },
    }),
    execution("action-1"),
    execution("action-2", { occurred_at: "2026-09-01T09:30:00.000Z" }),
    { event_type: "deal_won", contact_id: "contact-1", occurred_at: "2026-09-02T08:00:00.000Z", metadata: { recommendation_id: "action-1" } },
  ], { now });

  assert.equal(result.recommendations.find((row) => row.recommendationId === "action-1")?.strongestOutcomeType, "deal_won");
  assert.equal(result.recommendations.find((row) => row.recommendationId === "action-2")?.strongestOutcomeType, null);
});

test("deduplicates repeated daily snapshots of the same stable recommendation", () => {
  const result = measureRevenueBrainOutcomes([
    recommendation(),
    recommendation({ id: "rec-event-next-day", occurred_at: "2026-09-02T08:00:00.000Z" }),
    execution(),
  ], { now });

  assert.equal(result.summary.recommendations, 1);
  assert.equal(result.summary.executed, 1);
});

test("records Revenue Brain recommendations as idempotent measurement events", async () => {
  const inserted: any[] = [];
  const supabase = {
    from(table: string) {
      assert.equal(table, "revenue_events");
      return {
        insert(payload: any) {
          inserted.push(payload);
          return {
            select() {
              return {
                single: async () => ({ data: { id: `event-${inserted.length}`, ...payload }, error: null }),
              };
            },
          };
        },
      };
    },
  };

  const brain: RevenueBrainSnapshot = {
    generatedAt: "2026-09-12T08:00:00.000Z",
    mode: "READ_ONLY_V1",
    actions: [{
      id: "action-1",
      rank: 1,
      baseOpportunityScore: 83,
      learningAdjustment: 5,
      opportunityScore: 88,
      priority: "HIGH",
      source: "today",
      title: "Følg opp",
      subject: "Customer",
      recommendedAction: "Forbered et svar.",
      href: "/customers/1",
      contactId: "contact-1",
      expectedValueEur: 12000,
      policyClass: "DRAFT_ONLY",
      policyActionType: "general_customer_message",
      policyReason: "Human approval required before send.",
      rationale: [],
      automaticExecutionAllowed: false,
    }],
    summary: {
      considered: 1,
      ranked: 1,
      critical: 0,
      humanRequired: 0,
      draftOnly: 1,
      autoSafe: 0,
      wait: 0,
      forbidden: 0,
      learningAdjusted: 1,
      representedValueEur: 12000,
    },
    safety: {
      readOnly: true,
      automaticExecution: false,
      automaticSending: false,
      automaticApproval: false,
      automaticCriteriaChanges: false,
      explicitPolicyRequiredForFutureAutonomy: true,
      policyRegistryEnforced: true,
      outcomeLearningRankingOnly: true,
      outcomeLearningCanChangePolicy: false,
    },
  };

  const recorded = await recordRevenueBrainSnapshot(supabase, brain, { capturedAt: now });
  assert.equal(recorded.recorded, 1);
  assert.equal(inserted[0]?.event_type, "automation_recommended");
  assert.equal(inserted[0]?.source_system, "nexus_revenue_brain");
  assert.equal(inserted[0]?.metadata?.policy_class, "DRAFT_ONLY");
  assert.equal(inserted[0]?.metadata?.measurement_only, true);
  assert.match(String(inserted[0]?.dedupe_key), /nexus-revenue-brain:2026-09-12:action-1/);
});

test("records human-confirmed execution with stable recommendation linkage", async () => {
  const inserted: any[] = [];
  const supabase = {
    from(table: string) {
      assert.equal(table, "revenue_events");
      return {
        insert(payload: any) {
          inserted.push(payload);
          return { select: () => ({ single: async () => ({ data: { id: "execution-event", ...payload }, error: null }) }) };
        },
      };
    },
  };

  const result = await recordRevenueBrainExecution(supabase, recommendation(), { executedAt: now, actorId: "admin-1" });
  assert.equal(result.ok, true);
  assert.equal(inserted[0]?.event_type, "automation_executed");
  assert.equal(inserted[0]?.source_system, "nexus_revenue_brain");
  assert.equal(inserted[0]?.source_id, "action-1");
  assert.equal(inserted[0]?.actor_type, "human");
  assert.equal(inserted[0]?.metadata?.recommendation_id, "action-1");
  assert.equal(inserted[0]?.metadata?.execution_evidence, "human_confirmed");
  assert.match(String(inserted[0]?.dedupe_key), /nexus-revenue-brain:execution:action-1/);
});

test("refuses execution feedback for policy-blocked recommendations", async () => {
  const result = await recordRevenueBrainExecution({ from: () => { throw new Error("must not write"); } }, recommendation({
    metadata: { ...recommendation().metadata, policy_class: "FORBIDDEN" },
  }));
  assert.deepEqual(result, { ok: false, error: "RECOMMENDATION_POLICY_BLOCKED" });
});
