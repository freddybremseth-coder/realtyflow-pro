import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNexusMissionStateReadModel,
  buildNexusRevenueCommandReadModel,
} from "@/lib/nexus-command-readers";

test("Revenue Command read model keeps unknown sync untrusted", () => {
  const model = buildNexusRevenueCommandReadModel([], null, 0);
  assert.equal(model.syncHealth.status, "unknown");
  assert.equal(model.syncHealth.trustedForPipelineDecisions, false);
});

test("Revenue Command read model carries read warnings without breaking snapshot", () => {
  const model = buildNexusRevenueCommandReadModel([], null, 0, ["audit unavailable"]);
  assert.ok(model.warnings.includes("audit unavailable"));
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
