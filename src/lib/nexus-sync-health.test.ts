import assert from "node:assert/strict";
import test from "node:test";
import { buildNexusSyncHealth } from "./nexus-sync-health";

const now = new Date("2026-08-27T06:00:00.000Z");

test("no audit run stays unknown and cannot drive pipeline decisions", () => {
  const health = buildNexusSyncHealth(null, 0, now);
  assert.equal(health.state, "unknown");
  assert.equal(health.trustedForPipelineDecisions, false);
  assert.match(health.reason, /kan derfor ikke tolkes/);
});

test("failed sync blocks pipeline-gap automation", () => {
  const health = buildNexusSyncHealth({
    status: "error",
    error: "revenue source failed",
    finished_at: "2026-08-27T05:55:00.000Z",
  }, 0, now);
  assert.equal(health.state, "attention");
  assert.equal(health.trustedForPipelineDecisions, false);
  assert.equal(health.lastError, "revenue source failed");
});

test("successful but stale sync is not trusted", () => {
  const health = buildNexusSyncHealth({
    status: "success",
    finished_at: "2026-08-27T04:00:00.000Z",
  }, 12, now);
  assert.equal(health.state, "stale");
  assert.equal(health.trustedForPipelineDecisions, false);
});

test("fresh successful sync is trusted even when store is genuinely empty", () => {
  const health = buildNexusSyncHealth({
    status: "success",
    finished_at: "2026-08-27T05:50:00.000Z",
  }, 0, now);
  assert.equal(health.state, "healthy");
  assert.equal(health.trustedForPipelineDecisions, true);
  assert.match(health.reason, /eksplisitte mål/);
});
