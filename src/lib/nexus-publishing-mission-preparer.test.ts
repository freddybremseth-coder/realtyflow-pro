import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRun } from "@/lib/agentic/schemas";
import { buildNexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import {
  buildPublishingGrowthBrief,
  canPreparePublishingMission,
  preparedPublishingMissionTraceStep,
} from "@/lib/nexus-publishing-mission-preparer";

function mission(overrides: Partial<NexusGrowthMission> = {}): NexusGrowthMission {
  return {
    id: "mission:book-growth:1:sample_engaged",
    opportunityId: "book-growth:1",
    brandId: "freddypublishing",
    pipelineId: "publishing",
    stageId: "sample_engaged",
    role: "content_influencer",
    objective: "create_engagement",
    title: "Publishing: Example Book",
    nextAction: "Forsterk overgangen fra sample til kjøp med tydeligere CTA og retailer-link.",
    whyNow: "12 sample-klikk siste 30 dager viser aktiv leserinteresse.",
    desiredOutcome: "Flytt reader opportunity videre fra Sample engaged.",
    priority: "HIGH",
    priorityScore: 82,
    expectedValue: 25,
    currency: "USD",
    dueInHours: 8,
    autonomy: "prepare",
    href: "/book-growth",
    ...overrides,
  };
}

const run: AgentRun = {
  id: "run_book_1",
  agentId: "nexus_content_influencer",
  goal: "Flytt bokmuligheten videre",
  status: "pending",
  correlationId: "book-growth:1",
  idempotencyKey: "mission_book_1",
  startedAt: "2026-08-27T00:00:00Z",
  steps: [],
};

test("Publishing preparer accepts only prepare-only internal draft missions", () => {
  const m = mission();
  assert.equal(canPreparePublishingMission(m, buildNexusMissionAgenticPlan(m)), true);
  const closing = mission({ objective: "close", autonomy: "approval", role: "closer" });
  assert.equal(canPreparePublishingMission(closing, buildNexusMissionAgenticPlan(closing)), false);
});

test("Publishing brief preserves evidence and never fabricates confidence", () => {
  const m = mission();
  const brief = buildPublishingGrowthBrief(m);
  assert.equal(brief.recommendationType, "nexus_growth_brief");
  assert.equal(brief.evidence.mission_id, m.id);
  assert.equal(brief.evidence.priority_score, 82);
  assert.equal(brief.evidence.why_now, m.whyNow);
  assert.equal("confidence" in brief.evidence, false);
  assert.equal(brief.proposedValue.action, m.nextAction);
});

test("Publishing prepared trace is an internal recommendation, not customer communication", () => {
  const step = preparedPublishingMissionTraceStep(run, mission(), "rec_1", new Date("2026-08-27T00:10:00Z"));
  assert.equal(step.data?.transition, "prepared");
  assert.equal(step.data?.artifact_type, "book_growth_recommendation");
  assert.equal(step.data?.artifact_id, "rec_1");
  assert.equal(step.data?.external_action_executed, false);
  assert.equal(step.data?.channel_data_applied, false);
  assert.equal(step.data?.draft_id, undefined);
});
