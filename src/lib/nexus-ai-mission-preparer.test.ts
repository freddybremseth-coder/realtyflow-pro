import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRun } from "@/lib/agentic/schemas";
import { buildNexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import {
  canPrepareAiDemoMission,
  composeAiDemoMissionDraft,
  preparedAiMissionTraceStep,
} from "@/lib/nexus-ai-mission-preparer";

function mission(overrides: Partial<NexusGrowthMission> = {}): NexusGrowthMission {
  return {
    id: "mission:demosites:1:demo_or_solution",
    opportunityId: "demosites:1",
    brandId: "chatgenius",
    pipelineId: "ai_products_services",
    stageId: "demo_or_solution",
    role: "sales_sdr",
    objective: "advance_stage",
    title: "AI Products & Services: Example AS · DemoSites",
    nextAction: "Følg opp demoen med ett konkret use case.",
    whyNow: "En fungerende demo er tilgjengelig.",
    desiredOutcome: "Flytt muligheten videre.",
    priority: "HIGH",
    priorityScore: 78,
    expectedValue: 1990,
    currency: "NOK",
    dueInHours: 8,
    autonomy: "prepare",
    href: "/saas?tab=demosites",
    ...overrides,
  };
}

const run: AgentRun = {
  id: "run_ai_1",
  agentId: "nexus_sales_sdr",
  goal: "Flytt AI-saken videre",
  status: "pending",
  correlationId: "demosites:1",
  idempotencyKey: "mission_ai_1",
  startedAt: "2026-08-27T00:00:00Z",
  steps: [],
};

test("AI preparer accepts only Sales/SDR draft-first demo stages", () => {
  const m = mission();
  assert.equal(canPrepareAiDemoMission(m, buildNexusMissionAgenticPlan(m)), true);

  const closing = mission({
    id: "mission:demosites:1:proposal_or_pilot",
    stageId: "proposal_or_pilot",
    role: "closer",
    objective: "close",
    autonomy: "approval",
  });
  assert.equal(canPrepareAiDemoMission(closing, buildNexusMissionAgenticPlan(closing)), false);
});

test("AI draft uses only stored demo and claim URLs without inventing commercial claims", () => {
  const m = mission();
  const draft = composeAiDemoMissionDraft(m, {
    id: "1",
    customer_name: "Anna Example",
    company_name: "Example AS",
    preview_url: "https://demo.example.com",
    claim_url: "https://claim.example.com",
  });

  assert.match(draft.subject, /Example AS/);
  assert.match(draft.body, /https:\/\/demo\.example\.com/);
  assert.match(draft.body, /https:\/\/claim\.example\.com/);
  assert.doesNotMatch(draft.body.toLowerCase(), /garanter|rabatt|garanti|vil gi dere leads/);
});

test("non-http links are never inserted into customer draft", () => {
  const draft = composeAiDemoMissionDraft(mission(), {
    id: "1",
    customer_name: "Anna Example",
    preview_url: "javascript:alert(1)",
    claim_url: "not-a-url",
  });
  assert.doesNotMatch(draft.body, /javascript:/i);
  assert.doesNotMatch(draft.body, /not-a-url/);
});

test("prepared AI trace proves an artifact exists and nothing executed externally", () => {
  const step = preparedAiMissionTraceStep(run, mission(), "draft_ai_1", new Date("2026-08-27T00:10:00Z"));
  assert.equal(step.data?.transition, "prepared");
  assert.equal(step.data?.draft_id, "draft_ai_1");
  assert.equal(step.data?.domain, "ai_products_services");
  assert.equal(step.data?.external_action_executed, false);
});
