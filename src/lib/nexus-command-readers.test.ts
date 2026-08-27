import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNexusMissionStateReadModel,
  buildNexusRevenueCommandReadModel,
} from "@/lib/nexus-command-readers";

function opportunity(createdAt: string, sourceId: string) {
  return {
    contact_id: null,
    brand_id: "zeneco",
    offer_id: "property",
    pipeline_id: "real_estate_sales",
    stage_id: "qualified_buyer",
    lifecycle_phase: "qualification",
    opportunity_state: "active",
    title: `Buyer ${sourceId}`,
    reason: "Qualified buyer",
    next_action: "Match relevant property",
    priority: "HIGH",
    priority_score: 82,
    value: 500000,
    currency: "EUR",
    route_confidence: "high",
    route_reason: "CRM",
    source_system: "revenue_today",
    source_id: sourceId,
    source_updated_at: createdAt,
    last_activity_at: createdAt,
    metadata: { href: "/today", normalized_opportunity_id: `revenue:${sourceId}` },
    created_at: createdAt,
  } as any;
}

const freshSync = {
  status: "success",
  started_at: "2026-08-27T06:45:00.000Z",
  finished_at: "2026-08-27T06:46:00.000Z",
};

const zenecoTargetPlan = [{
  brand_id: "zeneco",
  status: "active",
  metadata: {
    nexus_commercial_targets: [
      { pipelineId: "real_estate_sales", targetNewPerWeek: 5 },
    ],
  },
}];

test("Revenue Command read model keeps unknown sync untrusted", () => {
  const model = buildNexusRevenueCommandReadModel([], null, 0);
  assert.equal(model.syncHealth.state, "unknown");
  assert.equal(model.syncHealth.trustedForPipelineDecisions, false);
});

test("Revenue Command read model carries read warnings without breaking snapshot", () => {
  const model = buildNexusRevenueCommandReadModel([], null, 0, ["audit unavailable"]);
  assert.ok(model.warnings.includes("audit unavailable"));
});

test("explicit target does not create demand mission before seven-day first-seen baseline", () => {
  const now = new Date("2026-08-27T07:00:00.000Z");
  const model = buildNexusRevenueCommandReadModel(
    [opportunity("2026-08-24T07:00:00.000Z", "one")],
    freshSync,
    1,
    [],
    zenecoTargetPlan,
    now,
  );

  assert.equal(model.commercialTargets[0].acquisitionEvidenceReady, false);
  assert.equal(model.directorMissions.some((mission) => mission.kind === "generate_demand"), false);
});

test("explicit target creates demand mission only after trusted seven-day evidence exists", () => {
  const now = new Date("2026-08-27T07:00:00.000Z");
  const model = buildNexusRevenueCommandReadModel(
    [
      opportunity("2026-08-18T07:00:00.000Z", "baseline"),
      opportunity("2026-08-25T07:00:00.000Z", "recent"),
    ],
    freshSync,
    2,
    [],
    zenecoTargetPlan,
    now,
  );

  assert.equal(model.commercialTargets[0].acquisitionEvidenceReady, true);
  assert.equal(model.commercialTargets[0].newOpportunities7d, 1);
  const demand = model.directorMissions.find((mission) => mission.kind === "generate_demand");
  assert.ok(demand);
  assert.match(demand.reason, /1\/5 nye opportunities/);
});

test("Mission State read model derives awaiting preparation from durable run trace", () => {
  const model = buildNexusMissionStateReadModel([
    {
      id: "run_1",
      agent_id: "nexus_sales_sdr",
      status: "pending",
      outcome: null,
      steps: [
        {
          id: "step_1",
          ts: "2026-08-27T06:00:00.000Z",
          kind: "tool_result",
          label: "Governed",
          data: { mission_id: "mission_1", transition: "await_preparer" },
        },
      ],
      started_at: "2026-08-27T06:00:00.000Z",
      updated_at: "2026-08-27T06:01:00.000Z",
    },
  ], []);

  assert.equal(model.states.length, 1);
  assert.equal(model.states[0].missionId, "mission_1");
  assert.equal(model.states[0].operationalState, "awaiting_preparation");
  assert.equal(model.summary.awaiting_preparation, 1);
});

test("Mission State read model preserves approval-backed waiting state", () => {
  const model = buildNexusMissionStateReadModel([
    {
      id: "run_2",
      agent_id: "nexus_sales_sdr",
      status: "waiting_approval",
      steps: [{ data: { mission_id: "mission_2", transition: "request_send_approval" } }],
      updated_at: "2026-08-27T06:02:00.000Z",
    },
  ], [
    {
      id: "approval_1",
      run_id: "run_2",
      status: "pending",
      created_at: "2026-08-27T06:02:00.000Z",
    },
  ]);

  assert.equal(model.states[0].operationalState, "waiting_approval");
  assert.equal(model.states[0].approvalId, "approval_1");
});
