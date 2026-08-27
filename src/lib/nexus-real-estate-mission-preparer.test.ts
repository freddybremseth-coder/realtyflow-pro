import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";
import {
  canPrepareRealEstateMission,
  composeRealEstateMissionDraft,
  preparedMissionTraceStep,
} from "@/lib/nexus-real-estate-mission-preparer";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { AgentRun } from "@/lib/agentic/schemas";

function mission(overrides: Partial<NexusGrowthMission> = {}): NexusGrowthMission {
  return {
    id: "mission:revenue:contact-1:new_lead",
    opportunityId: "revenue:contact-1",
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    stageId: "new_lead",
    role: "sales_sdr",
    objective: "create_engagement",
    title: "Real estate sales: Buyer A",
    nextAction: "Svar personlig og avklar område, budsjett, boligtype og tidslinje.",
    whyNow: "Ny lead trenger kontakt",
    desiredOutcome: "Flytt boligmuligheten videre fra Ny lead.",
    priority: "HIGH",
    priorityScore: 82,
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
  startedAt: "2026-08-27T00:00:00Z",
  steps: [],
};

test("only draft-first real estate SDR missions qualify for this preparer", () => {
  const eligible = mission();
  assert.equal(canPrepareRealEstateMission(eligible, buildNexusMissionAgenticPlan(eligible)), true);

  const closer = mission({ role: "closer", objective: "close", autonomy: "approval", stageId: "negotiation" });
  assert.equal(canPrepareRealEstateMission(closer, buildNexusMissionAgenticPlan(closer)), false);

  const publishing = mission({ pipelineId: "publishing", brandId: "freddypublishing" });
  assert.equal(canPrepareRealEstateMission(publishing, buildNexusMissionAgenticPlan(publishing)), false);
});

test("new lead draft asks for facts without inventing properties, prices or urgency", () => {
  const draft = composeRealEstateMissionDraft(mission(), { id: "contact-1", name: "Anna Example", email: "anna@example.com" });
  assert.match(draft.body, /område, budsjett, boligtype/i);
  assert.match(draft.body, /Hei Anna/);
  assert.doesNotMatch(draft.body, /€|reservert|tilbud|rabatt/i);
});

test("viewing draft asks for feedback instead of making new factual claims", () => {
  const draft = composeRealEstateMissionDraft(mission({ stageId: "viewing", objective: "advance_stage" }), { id: "contact-1", name: "Buyer" });
  assert.match(draft.body, /hvilke alternativer som traff best/i);
  assert.match(draft.body, /nye forslag eller en ny visning/i);
});

test("prepared trace records a real draft artifact and explicitly no external action", () => {
  const step = preparedMissionTraceStep(run, mission(), "draft-123", new Date("2026-08-27T00:00:00Z"));
  assert.equal(step.data?.transition, "prepared");
  assert.equal(step.data?.draft_id, "draft-123");
  assert.equal(step.data?.external_action_executed, false);
  assert.equal(step.outcome, "executed");
});
