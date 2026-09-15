import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalRealEstatePriority,
  sortCanonicalRealEstatePriorities,
} from "@/lib/nexus-real-estate-priority";
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
  assert.match(priority.reason, /provisjon ikke registrert/i);
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

test("transaction value remains visible without becoming revenue truth", () => {
  const qualified = buildCanonicalRealEstatePriority(contact("QUALIFIED"), NOW);
  assert.ok(qualified);
  assert.equal(qualified.stage, "QUALIFIED");
  assert.equal(qualified.value, 550000);
  assert.equal(qualified.transactionValue, 550000);
  assert.equal(qualified.commissionRevenue, null);
  assert.equal(qualified.commissionKnown, false);
  assert.equal(qualified.commissionSource, "unknown");
  assert.match(qualified.reason, /provisjon ikke registrert/i);
});

test("documented commission can outrank a more expensive property with unknown commission", () => {
  const expensiveUnknown = buildCanonicalRealEstatePriority({
    ...contact("QUALIFIED"),
    id: "expensive-unknown",
    pipeline_value: 900000,
  }, NOW);
  const documentedRevenue = buildCanonicalRealEstatePriority({
    ...contact("QUALIFIED"),
    id: "documented-revenue",
    pipeline_value: 350000,
    commission_percent: 10,
  }, NOW);

  assert.ok(expensiveUnknown && documentedRevenue);
  assert.equal(expensiveUnknown.commissionRevenue, null);
  assert.equal(documentedRevenue.commissionRevenue, 35000);
  assert.ok(documentedRevenue.score > expensiveUnknown.score);
  const sorted = sortCanonicalRealEstatePriorities([expensiveUnknown, documentedRevenue]);
  assert.equal(sorted[0].id, "documented-revenue");
});

test("explicit commission amount takes precedence over a rate-derived estimate", () => {
  const priority = buildCanonicalRealEstatePriority({
    ...contact("VIEWING"),
    commission_amount: 42000,
    commission_percent: 10,
  }, NOW);
  assert.ok(priority);
  assert.equal(priority.commissionRevenue, 42000);
  assert.equal(priority.commissionSource, "explicit_amount");
  assert.match(priority.reason, /bekreftet provisjon/i);
});

test("strong fresh customer behavior remains HIGH without any property-price bonus", () => {
  const priority = buildCanonicalRealEstatePriority({
    id: "fresh-intent",
    name: "Fresh Intent Buyer",
    email: "fresh@example.com",
    pipeline_status: "CONTACT",
    pipeline_value: 900000,
    next_followup: "2026-09-20T09:00:00.000Z",
    last_contact: "2026-09-10T09:00:00.000Z",
    brand_id: "zeneco",
  }, NOW, {
    revenueEvents: [{
      event_type: "email_received",
      occurred_at: "2026-09-14T09:00:00.000Z",
      metadata: { body_preview: "Vi er klar for visning og kan reise neste uke." },
    }],
  });

  assert.ok(priority);
  assert.equal(priority.commissionRevenue, null);
  assert.equal(priority.priority, "HIGH");
  assert.ok(priority.score >= 75);
  assert.match(priority.reason, /kunden svarte nylig/i);
});

test("overdue MATCHING remains HIGH even when commission is unknown", () => {
  const priority = buildCanonicalRealEstatePriority({
    ...contact("MATCHING"),
    id: "matching-overdue",
    pipeline_value: 900000,
    commission_amount: null,
    commission_percent: null,
    next_followup: "2026-09-10T09:00:00.000Z",
  }, NOW);

  assert.ok(priority);
  assert.equal(priority.stage, "MATCHING");
  assert.equal(priority.commissionRevenue, null);
  assert.equal(priority.isOverdue, true);
  assert.equal(priority.priority, "HIGH");
  assert.match(priority.reason, /oppfølging er forfalt/i);
});
