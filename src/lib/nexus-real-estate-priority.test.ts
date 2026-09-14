import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalRealEstatePriority } from "@/lib/nexus-real-estate-priority";
import { revenuePriorityToRealEstateOpportunity } from "@/lib/nexus-opportunity-adapters";
import { buildNexusGrowthMission } from "@/lib/nexus-growth-mission";
import { buildNexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

const NOW = new Date("2026-09-14T12:00:00.000Z");

function contact(stage: string) {
  return {
    id: `buyer-${stage.toLowerCase()}`,
    name: `${stage} Buyer`,
    email: `${stage.toLowerCase()}@example.com`,
    phone: "+34123456789",
    pipeline_status: stage,
    pipeline_value: 550000,
    property_interest: "Altea / 3 bedrooms",
    next_followup: "2026-09-15T09:00:00.000Z",
    last_contact: "2026-09-13T09:00:00.000Z",
    brand_id: "zeneco",
  };
}

test("MATCHING remains an active sales priority and hands off to the internal matching specialist", () => {
  const priority = buildCanonicalRealEstatePriority(contact("MATCHING"), NOW);
  assert.ok(priority);
  assert.equal(priority.stage, "MATCHING");
  assert.ok(priority.score >= 60);
  assert.match(priority.reason, /boligmatching/i);
  assert.match(priority.recommendedAction, /property matching/i);
  assert.match(priority.recommendedAction, /review/i);

  const opportunity = revenuePriorityToRealEstateOpportunity(priority);
  assert.ok(opportunity);
  assert.equal(opportunity.stageId, "property_matching");
  assert.equal(opportunity.phase, "consideration");

  const mission = buildNexusGrowthMission(opportunity);
  assert.equal(mission.role, "sales_sdr");
  assert.equal(mission.objective, "advance_stage");
  assert.equal(mission.autonomy, "prepare");

  const plan = buildNexusMissionAgenticPlan(mission);
  assert.equal(plan.actionClass, "match");
  assert.equal(plan.actionContext.channel, "internal");
  assert.equal(plan.externalSideEffectAllowed, false);
});

test("RESERVED remains a high closing priority and maps to delivery stage", () => {
  const priority = buildCanonicalRealEstatePriority(contact("RESERVED"), NOW);
  assert.ok(priority);
  assert.equal(priority.stage, "RESERVED");
  assert.equal(priority.kind, "closing");
  assert.ok(["HIGH", "CRITICAL"].includes(priority.priority));
  assert.match(priority.recommendedAction, /closing/i);

  const opportunity = revenuePriorityToRealEstateOpportunity(priority);
  assert.ok(opportunity);
  assert.equal(opportunity.stageId, "reserved");
  assert.equal(opportunity.phase, "delivery");

  const mission = buildNexusGrowthMission(opportunity);
  assert.equal(mission.role, "customer_success");
  assert.equal(mission.objective, "deliver");
  assert.equal(mission.autonomy, "approval");
});

test("existing stages keep legacy Revenue Today scoring semantics", () => {
  const qualified = buildCanonicalRealEstatePriority(contact("QUALIFIED"), NOW);
  assert.ok(qualified);
  assert.equal(qualified.stage, "QUALIFIED");
  assert.match(qualified.recommendedAction, /property matching/i);
});
