import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNexusMissionAgenticPlan,
  missionActionClass,
  missionToActionContext,
} from "@/lib/nexus-mission-agentic";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";

function mission(overrides: Partial<NexusGrowthMission> = {}): NexusGrowthMission {
  return {
    id: "mission:1",
    opportunityId: "opp:1",
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    stageId: "qualified",
    role: "sales_sdr",
    objective: "qualify",
    title: "Kvalifiser kjøper",
    nextAction: "Avklar budsjett og tidslinje",
    whyNow: "Kunden har svart",
    desiredOutcome: "Kvalifisert kjøper",
    priority: "HIGH",
    priorityScore: 92,
    expectedValue: 500000,
    currency: "EUR",
    dueInHours: 8,
    autonomy: "prepare",
    href: "/customers",
    ...overrides,
  };
}

test("prepare mission can prepare autonomously but cannot silently become live execution", () => {
  const plan = buildNexusMissionAgenticPlan(mission());
  assert.equal(plan.actionClass, "enrich");
  assert.equal(plan.capability, "prepare_only");
  assert.equal(plan.effectiveMode, "draft-first");
  assert.equal(plan.externalSideEffectAllowed, false);
});

test("closing mission reuses existing hard-gated offer response policy", () => {
  const plan = buildNexusMissionAgenticPlan(mission({ role: "closer", objective: "close", autonomy: "approval", stageId: "negotiation" }));
  assert.equal(plan.actionClass, "offer_response");
  assert.equal(plan.policyDecision.mode, "human-required");
  assert.equal(plan.effectiveMode, "human-required");
  assert.match(plan.policyDecision.hardGate || "", /krever alltid menneskelig godkjenning/i);
  assert.equal(plan.externalSideEffectAllowed, false);
});

test("suggest-only mission is reduced to internal research", () => {
  const plan = buildNexusMissionAgenticPlan(mission({ autonomy: "suggest", objective: "advance_stage" }));
  assert.equal(missionActionClass(mission({ autonomy: "suggest" })), "research");
  assert.equal(plan.actionContext.channel, "internal");
  assert.equal(plan.capability, "recommendation_only");
  assert.equal(plan.externalSideEffectAllowed, false);
  assert.match(plan.guardrailReason || "", /suggest-fullmakt/i);
});

test("delivery approval floor tightens low-risk scheduling to manual review", () => {
  const plan = buildNexusMissionAgenticPlan(mission({ role: "customer_success", objective: "deliver", autonomy: "approval", stageId: "delivery" }));
  assert.equal(plan.actionClass, "schedule");
  assert.equal(plan.effectiveMode, "manual-review");
  assert.equal(plan.externalSideEffectAllowed, false);
});

test("priority score is never reused as confidence", () => {
  const ctx = missionToActionContext(mission({ priorityScore: 99 }));
  assert.equal(ctx.agentConfidence, undefined);
  assert.equal(ctx.historicalAccuracy, undefined);
  assert.equal(ctx.dataQuality, undefined);
});

test("documented confidence evidence is passed separately to the policy engine", () => {
  const ctx = missionToActionContext(mission(), { agentConfidence: 0.91, historicalAccuracy: 0.82, dataQuality: 0.88 });
  assert.equal(ctx.agentConfidence, 0.91);
  assert.equal(ctx.historicalAccuracy, 0.82);
  assert.equal(ctx.dataQuality, 0.88);
});
