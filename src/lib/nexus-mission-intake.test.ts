import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryAgentRunStore } from "@/lib/agentic/run-store";
import { buildNexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";
import { intakeNexusMission, nexusMissionRunIdempotencyKey } from "@/lib/nexus-mission-intake";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";

function mission(overrides: Partial<NexusGrowthMission> = {}): NexusGrowthMission {
  return {
    id: "mission:revenue:contact-1:negotiation",
    opportunityId: "revenue:contact-1",
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    stageId: "negotiation",
    role: "closer",
    objective: "close",
    title: "Real estate sales: Buyer A",
    nextAction: "Avklar pris, vilkår og neste steg",
    whyNow: "Forhandling er stale",
    desiredOutcome: "Flytt saken mot reservasjon",
    priority: "CRITICAL",
    priorityScore: 96,
    expectedValue: 500000,
    currency: "EUR",
    dueInHours: 2,
    autonomy: "approval",
    href: "/customers?contactId=contact-1",
    ...overrides,
  };
}

test("mission intake creates a pending durable run without claiming approval or execution", async () => {
  const store = new InMemoryAgentRunStore();
  const m = mission();
  const plan = buildNexusMissionAgenticPlan(m);
  const result = await intakeNexusMission(store, m, plan, new Date("2026-08-27T00:00:00Z"));

  assert.equal(result.created, true);
  assert.equal(result.run.status, "pending");
  assert.equal(result.run.outcome, undefined);
  assert.equal(result.run.decision?.mode, "human-required");
  assert.equal(result.run.steps[0]?.kind, "decision");
  assert.equal(result.run.steps[0]?.data?.mission_id, m.id);
  assert.equal(result.run.steps[0]?.data?.opportunity_id, m.opportunityId);
  assert.equal(result.run.steps[0]?.data?.external_side_effect_allowed, false);
});

test("same mission is idempotent across retries", async () => {
  const store = new InMemoryAgentRunStore();
  const m = mission({ stageId: "qualified", objective: "qualify", role: "sales_sdr", autonomy: "prepare" });
  const plan = buildNexusMissionAgenticPlan(m);

  const first = await intakeNexusMission(store, m, plan, new Date("2026-08-27T00:00:00Z"));
  const second = await intakeNexusMission(store, m, plan, new Date("2026-08-27T01:00:00Z"));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.run.id, first.run.id);
  assert.equal(second.run.idempotencyKey, nexusMissionRunIdempotencyKey(m));
});

test("priority is audit context and never promoted to confidence evidence", async () => {
  const store = new InMemoryAgentRunStore();
  const m = mission({ priorityScore: 100, objective: "advance_stage", role: "sales_sdr", autonomy: "prepare" });
  const plan = buildNexusMissionAgenticPlan(m);
  const result = await intakeNexusMission(store, m, plan);

  assert.equal(result.run.steps[0]?.data?.priority_score, 100);
  assert.equal(result.run.steps[0]?.confidence, undefined);
});
