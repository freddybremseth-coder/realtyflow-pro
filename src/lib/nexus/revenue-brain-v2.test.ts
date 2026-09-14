import assert from "node:assert/strict";
import test from "node:test";
import { buildRevenueBrainV2, type RevenueBrainV2Input } from "./revenue-brain-v2";

function input(): RevenueBrainV2Input {
  return {
    generatedAt: "2026-09-14T10:00:00.000Z",
    growthMissions: [
      { id: "m-close", opportunityId: "o-close", brandId: "zeneco", pipelineId: "real_estate_sales", stageId: "negotiation", role: "closer", objective: "close", title: "Close Gerald", nextAction: "Resolve contract", whyNow: "Stale negotiation", desiredOutcome: "Sale", priority: "CRITICAL", priorityScore: 96, expectedValue: 420000, currency: "EUR", dueInHours: 2, href: "/closing" },
      { id: "m-lead", opportunityId: "o-lead", brandId: "zeneco", pipelineId: "real_estate_sales", stageId: "qualified", role: "sales_sdr", objective: "qualify", title: "Qualify lead", nextAction: "Prepare questions", whyNow: "New reply", desiredOutcome: "Viewing", priority: "HIGH", priorityScore: 80, expectedValue: null, currency: null, dueInHours: 8, href: "/customers/1" },
    ],
    agenticPlans: [
      { missionId: "m-close", capability: "approval_required", effectiveMode: "manual-review", guardrailReason: "Closing requires approval.", externalSideEffectAllowed: false },
      { missionId: "m-lead", capability: "prepare_only", effectiveMode: "draft-first", guardrailReason: null, externalSideEffectAllowed: false },
    ],
    health: [{ brandId: "zeneco", pipelineId: "real_estate_sales", health: "CRITICAL", staleOpportunities: 2, staleConversionOpportunities: 1, unknownFreshness: 0, reasons: ["Closing leakage"] }],
    warnings: [],
  };
}

test("v2 prioritizes cash-now urgency and exposes the governed decision", () => {
  const brain = buildRevenueBrainV2(input());
  assert.equal(brain.mode, "READ_ONLY_V2");
  assert.equal(brain.decisions[0]?.opportunityId, "o-close");
  assert.equal(brain.decisions[0]?.focus, "CASH_NOW");
  assert.equal(brain.decisions[0]?.readiness, "HUMAN_DECISION");
  assert.equal(brain.decisions[0]?.automaticExecutionAllowed, false);
  assert.equal(brain.safety.policyPlanAuthoritative, true);
});

test("v2 allows preparation without granting external execution", () => {
  const decision = buildRevenueBrainV2(input()).decisions.find((row) => row.opportunityId === "o-lead");
  assert.equal(decision?.readiness, "READY_TO_PREPARE");
  assert.equal(decision?.policy?.externalSideEffectAllowed, false);
});

test("v2 fails closed when a mission has no policy plan", () => {
  const value = input();
  value.agenticPlans = value.agenticPlans.filter((row) => row.missionId !== "m-close");
  const decision = buildRevenueBrainV2(value).decisions[0];
  assert.equal(decision?.readiness, "BLOCKED");
  assert.ok(decision?.blockers.some((row) => /policyplan/i.test(row)));
});
