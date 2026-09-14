import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRealEstateMatchingPreparation,
  canPrepareRealEstateMatchingMission,
  matchingWorkItemPriority,
  preparedMatchingTraceStep,
} from "@/lib/nexus-real-estate-matching-preparer";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

const NOW = new Date("2026-09-14T12:00:00.000Z");

function mission(overrides: Partial<NexusGrowthMission> = {}): NexusGrowthMission {
  return {
    id: "mission:revenue:buyer-1:property_matching",
    opportunityId: "revenue:buyer-1",
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    stageId: "property_matching",
    role: "sales_sdr",
    objective: "advance_stage",
    title: "Finn riktige boliger",
    nextAction: "Velg 3–5 kvalitetssikrede boliger",
    whyNow: "Kjøperprofilen er klar",
    desiredOutcome: "Kunde med konkret shortlist",
    priority: "HIGH",
    priorityScore: 88,
    expectedValue: 500000,
    currency: "EUR",
    dueInHours: 12,
    autonomy: "prepare",
    href: "/customers/buyer-1",
    ...overrides,
  };
}

function plan(overrides: Partial<NexusMissionAgenticPlan> = {}): NexusMissionAgenticPlan {
  return {
    missionId: mission().id,
    opportunityId: mission().opportunityId,
    agentId: "nexus_sales_sdr",
    actionClass: "match",
    capability: "prepare_only",
    actionContext: {
      actionClass: "match",
      agentId: "nexus_sales_sdr",
      reversibility: "reversible",
      channel: "internal",
      permission: "allowed",
    },
    policyDecision: {
      mode: "live",
      autonomyScore: 0.9,
      risk: "low",
      factors: { confidence: 1, historicalAccuracy: 1, dataQuality: 1, reversibility: 1, permission: 1, risk: 0.9 },
      hardGate: null,
      reason: "internal safe match",
    },
    effectiveMode: "draft-first",
    guardrailReason: null,
    externalSideEffectAllowed: false,
    ...overrides,
  };
}

const CONTACT = {
  id: "buyer-1",
  name: "Harald Buyer",
  email: "harald@example.com",
  brand_id: "zeneco",
  pipeline_status: "MATCHING",
};

const PROFILE = {
  id: "profile-1",
  version: 3,
  status: "approved",
  budgetAmount: 550000,
  purchaseReadiness: "ready_now",
  updatedAt: "2026-09-10T10:00:00.000Z",
};

const CRITERIA = [
  { key: "location", value: "Altea", customerConfirmed: true, confidence: 0.98, approvalStatus: "approved", active: true },
  { key: "property_type", value: "villa", customerConfirmed: true, confidence: 0.96, approvalStatus: "approved", active: true },
  { key: "bedrooms", value: 3, customerConfirmed: true, confidence: 0.95, approvalStatus: "approved", active: true },
];

test("only governed property-matching prepare missions use the matching preparer", () => {
  assert.equal(canPrepareRealEstateMatchingMission(mission(), plan()), true);
  assert.equal(canPrepareRealEstateMatchingMission(mission({ stageId: "qualified_buyer" }), plan()), false);
  assert.equal(canPrepareRealEstateMatchingMission(mission(), plan({ actionClass: "draft" })), false);
  assert.equal(canPrepareRealEstateMatchingMission(mission(), plan({ effectiveMode: "human-required" })), false);
});

test("approved healthy profile seeds the existing CRM matching chain without customer send", () => {
  const prepared = buildRealEstateMatchingPreparation(mission(), CONTACT, PROFILE, CRITERIA, NOW);
  assert.equal(prepared.ready, true);
  assert.equal(prepared.health.status, "HEALTHY");
  assert.equal(prepared.metadata.classification, "property_interest");
  assert.equal(prepared.metadata.buyer_profile_id, PROFILE.id);
  assert.equal(prepared.metadata.buyer_profile_status, "APPROVED");
  assert.equal(prepared.metadata.buyer_profile_sync_status, "linked_existing");
  assert.equal(prepared.metadata.property_match_prepared_at, null);
  assert.equal(prepared.metadata.customer_send, false);
  assert.equal(prepared.metadata.external_action_executed, false);
  assert.match(prepared.sourceId, /^nexus-matching:/);
  assert.match(prepared.nextAction, /property matching/i);
  assert.match(prepared.nextAction, /review/i);
});

test("profile blockers fail closed while warnings can still enter review-gated matching", () => {
  const blocked = buildRealEstateMatchingPreparation(
    mission(),
    CONTACT,
    { ...PROFILE, budgetAmount: null },
    CRITERIA,
    NOW,
  );
  assert.equal(blocked.ready, false);
  assert.equal(blocked.health.status, "BLOCKED");
  assert.match(blocked.health.blockers.join(" "), /budsjett/i);

  const warning = buildRealEstateMatchingPreparation(
    mission(),
    CONTACT,
    PROFILE,
    CRITERIA.filter((item) => item.key !== "bedrooms"),
    NOW,
  );
  assert.equal(warning.ready, true);
  assert.equal(warning.health.status, "NEEDS_ATTENTION");
  assert.match(warning.health.warnings.join(" "), /soverom/i);
});

test("matching work priority and trace remain internal and idempotent-friendly", () => {
  assert.equal(matchingWorkItemPriority("CRITICAL"), "HIGH");
  assert.equal(matchingWorkItemPriority("MEDIUM"), "MEDIUM");
  const run = {
    id: "run-1",
    agentId: "nexus-ai",
    goal: "match",
    status: "running" as const,
    startedAt: NOW.toISOString(),
    steps: [],
  };
  const step = preparedMatchingTraceStep(run, mission(), "work-1", PROFILE.id, NOW);
  assert.equal(step.data?.transition, "prepared");
  assert.equal(step.data?.artifact_type, "property_matching_work_item");
  assert.equal(step.data?.customer_send, false);
  assert.equal(step.data?.external_action_executed, false);
  assert.match(step.id, /^step_[a-f0-9]{24}$/);
});
