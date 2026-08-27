import assert from "node:assert/strict";
import test from "node:test";
import { bestEffortNexusAutomationAudit, recordNexusAutomationRun } from "./nexus-automation-audit";

function store(failTable?: string) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  return {
    inserts,
    client: {
      from(table: string) {
        return {
          async insert(values: Record<string, unknown>) {
            inserts.push({ table, values });
            return table === failTable ? { error: { message: `${table} failed` } } : { error: null };
          },
        };
      },
    },
  };
}

test("writes both automation_runs and automation_logs with route context", async () => {
  const s = store();
  const result = await recordNexusAutomationRun(s.client, {
    name: "Nexus Opportunity Sync",
    path: "/api/cron/nexus-opportunity-sync",
    status: "success",
    input: { sources: ["real_estate"] },
    output: { upserted: 3 },
    startedAt: "2026-08-27T05:00:00.000Z",
    finishedAt: "2026-08-27T05:00:02.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(s.inserts.length, 2);
  assert.equal(s.inserts[0].table, "automation_runs");
  assert.equal((s.inserts[0].values.input as Record<string, unknown>).path, "/api/cron/nexus-opportunity-sync");
  assert.equal(s.inserts[1].table, "automation_logs");
});

test("audit failures are returned and never thrown by best-effort wrapper", async () => {
  const s = store("automation_runs");
  const result = await bestEffortNexusAutomationAudit(s.client, {
    name: "Nexus Mission Autopilot",
    path: "/api/cron/nexus-mission-autopilot",
    status: "error",
    error: "source unavailable",
  });
  assert.equal(result.ok, false);
  assert.equal(result.runError, "automation_runs failed");
});
