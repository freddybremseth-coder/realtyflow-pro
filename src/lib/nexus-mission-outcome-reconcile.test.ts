import assert from "node:assert/strict";
import { test } from "node:test";
import { nexusRunOutcomePatch } from "@/lib/nexus-mission-outcome-reconcile";

const nexusRun = { id: "run_1", agent_id: "nexus_sales_sdr", status: "waiting_approval", outcome: null };

test("executed approval completes a Nexus mission run", () => {
  const patch = nexusRunOutcomePatch({
    status: "executed",
    resolved_at: "2026-08-27T00:10:00Z",
    executed_at: "2026-08-27T00:11:00Z",
  }, nexusRun);
  assert.deepEqual(patch, {
    status: "completed",
    outcome: "executed",
    finished_at: "2026-08-27T00:11:00Z",
  });
});

test("rejected approval completes a Nexus mission as rejected", () => {
  const patch = nexusRunOutcomePatch({
    status: "rejected",
    resolved_at: "2026-08-27T00:12:00Z",
  }, nexusRun);
  assert.deepEqual(patch, {
    status: "completed",
    outcome: "rejected",
    finished_at: "2026-08-27T00:12:00Z",
  });
});

test("approved but not executed remains waiting for executor", () => {
  const patch = nexusRunOutcomePatch({ status: "approved" }, nexusRun);
  assert.deepEqual(patch, {
    status: "waiting_approval",
    outcome: "approved",
    finished_at: null,
  });
});

test("non-Nexus agent runs are never mutated", () => {
  const patch = nexusRunOutcomePatch(
    { status: "executed", executed_at: "2026-08-27T00:11:00Z" },
    { id: "legacy", agent_id: "lead-intake", status: "waiting_approval", outcome: null },
  );
  assert.equal(patch, null);
});

test("pending approvals do not change durable run outcome", () => {
  assert.equal(nexusRunOutcomePatch({ status: "pending" }, nexusRun), null);
});
