import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusMissionStateProjection } from "@/lib/nexus-mission-state";

function run(id: string, missionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    agent_id: "nexus_sales_sdr",
    status: "pending",
    outcome: null,
    started_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
    steps: [{ data: { mission_id: missionId, ...(overrides.transition ? { transition: overrides.transition } : {}) } }],
    ...overrides,
  };
}

test("await_preparer becomes awaiting_preparation", () => {
  const rows = buildNexusMissionStateProjection([run("run_1", "mission:1", { transition: "await_preparer" })]);
  assert.equal(rows[0]?.operationalState, "awaiting_preparation");
});

test("real prepared draft becomes prepared and exposes draft id", () => {
  const rows = buildNexusMissionStateProjection([run("run_1", "mission:1", {
    steps: [
      { data: { mission_id: "mission:1", transition: "await_preparer" } },
      { data: { mission_id: "mission:1", transition: "prepared", draft_id: "draft-123" } },
    ],
  })]);
  assert.equal(rows[0]?.operationalState, "prepared");
  assert.equal(rows[0]?.draftId, "draft-123");
});

test("pending approval record becomes waiting_approval", () => {
  const rows = buildNexusMissionStateProjection(
    [run("run_1", "mission:1", { status: "waiting_approval", transition: "request_approval" })],
    [{ id: "approval-1", run_id: "run_1", status: "pending", created_at: "2026-08-27T00:01:00Z" }],
  );
  assert.equal(rows[0]?.operationalState, "waiting_approval");
  assert.equal(rows[0]?.approvalId, "approval-1");
});

test("approval and execution states override pending run status", () => {
  const approved = buildNexusMissionStateProjection(
    [run("run_a", "mission:a")],
    [{ id: "approval-a", run_id: "run_a", status: "approved" }],
  );
  const executed = buildNexusMissionStateProjection(
    [run("run_e", "mission:e")],
    [{ id: "approval-e", run_id: "run_e", status: "executed" }],
  );
  assert.equal(approved[0]?.operationalState, "approved");
  assert.equal(executed[0]?.operationalState, "executed");
});

test("completed recommended run is projected as recommended", () => {
  const rows = buildNexusMissionStateProjection([run("run_1", "mission:1", { status: "completed", outcome: "recommended" })]);
  assert.equal(rows[0]?.operationalState, "recommended");
});

test("latest run wins if legacy duplicates exist for a mission", () => {
  const rows = buildNexusMissionStateProjection([
    run("old", "mission:1", { updated_at: "2026-08-26T20:00:00Z" }),
    run("new", "mission:1", { updated_at: "2026-08-27T00:00:00Z", transition: "await_preparer" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.runId, "new");
  assert.equal(rows[0]?.operationalState, "awaiting_preparation");
});
