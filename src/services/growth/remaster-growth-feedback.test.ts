import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRemasterGrowthOutcome } from "./remaster-growth-feedback";

const NOW = Date.parse("2026-09-05T12:00:00Z");

test("marks strong lift as positive after observation window", () => {
  const result = evaluateRemasterGrowthOutcome({ beforeViewsPerDay: 10, afterViewsPerDay: 13, executedAt: "2026-08-25T12:00:00Z", nowMs: NOW });
  assert.equal(result.outcome, "POSITIVE");
  assert.equal(Math.round(result.liftPct || 0), 30);
});

test("marks strong decline as negative", () => {
  const result = evaluateRemasterGrowthOutcome({ beforeViewsPerDay: 20, afterViewsPerDay: 15, executedAt: "2026-08-25T12:00:00Z", nowMs: NOW });
  assert.equal(result.outcome, "NEGATIVE");
});

test("keeps small change neutral", () => {
  const result = evaluateRemasterGrowthOutcome({ beforeViewsPerDay: 20, afterViewsPerDay: 21, executedAt: "2026-08-25T12:00:00Z", nowMs: NOW });
  assert.equal(result.outcome, "NEUTRAL");
});

test("requires enough post-action observation time", () => {
  const result = evaluateRemasterGrowthOutcome({ beforeViewsPerDay: 10, afterViewsPerDay: 30, executedAt: "2026-09-02T12:00:00Z", nowMs: NOW });
  assert.equal(result.outcome, "INSUFFICIENT_DATA");
});
