import assert from "node:assert/strict";
import test from "node:test";
import { resolveCronControlDecision } from "./runtime-controls";

test("route kill switch overrides an enabled global cron control", () => {
  const result = resolveCronControlDecision(
    "/api/cron/marketing-autopilot",
    [
      { control_key: "cron:global", label: "Global cron", enabled: true },
      { control_key: "cron:/api/cron/marketing-autopilot", label: "Marketing Autopilot", enabled: false },
    ],
    { failClosed: true },
  );

  assert.deepEqual(result, { enabled: false, reason: "Marketing Autopilot is disabled in Nexus" });
});

test("fail-closed cron stops when the control lookup is unavailable", () => {
  const result = resolveCronControlDecision(
    "/api/cron/marketing-autopilot",
    null,
    { failClosed: true },
    "lookup failed",
  );

  assert.deepEqual(result, { enabled: false, reason: "lookup failed" });
});

test("fail-closed cron stops when its required route control is missing", () => {
  const result = resolveCronControlDecision(
    "/api/cron/marketing-autopilot",
    [{ control_key: "cron:global", label: "Global cron", enabled: true }],
    { failClosed: true },
  );

  assert.deepEqual(result, {
    enabled: false,
    reason: "Required Nexus runtime control cron:/api/cron/marketing-autopilot is missing",
  });
});

test("legacy non-critical crons preserve the existing permissive fallback", () => {
  assert.deepEqual(resolveCronControlDecision("/api/cron/example", null), { enabled: true });
  assert.deepEqual(resolveCronControlDecision("/api/cron/example", []), { enabled: true });
});
