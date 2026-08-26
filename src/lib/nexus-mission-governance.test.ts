import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRun } from "@/lib/agentic/schemas";
import { buildNexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";
import {
  missionApprovalInput,
  missionGovernanceTransition,
} from "@/lib/nexus-mission-governance";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";

function mission(overrides: Partial<NexusGrowthMission> = {}): NexusGrowthMission {
  return {
    id: "mission:opp:1:qualified",
    opportunityId: "opp:1",
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    stageId: "qualified",
    role: "sales_sdr",
    objective: "qualify",
    title: "Kvalifiser kjøper",
    nextAction: "Avklar budsjett og timing",
    whyNow: "Kunden har svart",
    desiredOutcome: "Kvalifisert kjøper",
    priority: "HIGH",
    priorityScore: 88,
    expectedValue: 500000,
    currency: "EUR",
    dueInHours: 8,
    autonomy: "prepare",
    href: "/customers",
    ...overrides,
  };
}

const run: AgentRun = {
  id: "run_1",
  agentId: "nexus_sales_sdr",
  goal: "Flytt saken videre",
  status: "pending",
  correlationId: "opp:1",
  idempotencyKey: "mission_key",
  startedAt: "2026-08-27T00:00:00Z",
  steps: [],
};

test("suggest-only missions complete as recommendations", () => {
  const m = mission({ autonomy: "suggest", objective: "advance_stage" });
  const plan = buildNexusMissionAgenticPlan(m);
  assert.equal(missionGovernanceTransition(plan), "complete_recommendation");
});

test("prepare missions wait for a real domain preparer", () => {
  const m = mission({ autonomy: "prepare" });
  const plan = buildNexusMissionAgenticPlan(m);
  assert.equal(missionGovernanceTransition(plan), "await_preparer");
});

test("closing missions enter the real approval gateway", () => {
  const m = mission({
    stageId: "negotiation",
    role: "closer",
    objective: "close",
    autonomy: "approval",
  });
  const plan = buildNexusMissionAgenticPlan(m);
  assert.equal(missionGovernanceTransition(plan), "request_approval");

  const approval = missionApprovalInput(m, plan, run);
  assert.equal(approval.subjectType, "generic_agent_action");
  assert.equal(approval.subjectRef, m.id);
  assert.equal(approval.gatedActionClass, "offer_response");
  assert.equal(approval.decisionMode, "human-required");
  assert.equal(approval.confidence, undefined);
  assert.equal(approval.estimatedOpportunityEur, 500000);
});

test("non-EUR values are not mislabeled as EUR opportunity impact", () => {
  const m = mission({
    currency: "NOK",
    expectedValue: 25000,
    stageId: "proposal_or_pilot",
    pipelineId: "ai_products_services",
    role: "closer",
    objective: "close",
    autonomy: "approval",
  });
  const plan = buildNexusMissionAgenticPlan(m);
  const approval = missionApprovalInput(m, plan, run);
  assert.equal(approval.estimatedOpportunityEur, undefined);
});
