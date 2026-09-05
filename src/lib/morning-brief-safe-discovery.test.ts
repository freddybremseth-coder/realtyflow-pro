import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverGap, discoverGaps } from "@/lib/morning-brief-safe-discovery";
import type { DataGap } from "@/lib/morning-brief-data-gaps";

function gap(overrides: Partial<DataGap> = {}): DataGap {
  return {
    field: "ai_score",
    message: "AI score is missing or zero.",
    resolution: "AUTO_DISCOVERABLE",
    rationale: "Nexus may be able to discover this from existing canonical system evidence without asking the owner first.",
    ...overrides,
  };
}

test("human-required gaps are skipped and never inferred", () => {
  const result = discoverGap(gap({ field: "next_followup", resolution: "HUMAN_REQUIRED" }), [
    { source: "crm_history", value: "2026-09-10T10:00:00Z", strength: 100 },
  ]);
  assert.equal(result.status, "SKIPPED_HUMAN_REQUIRED");
  assert.equal(result.writeAllowed, false);
  assert.equal(result.confidence, 0);
  assert.equal("proposedValue" in result, false);
});

test("auto-discoverable gap returns deterministic proposal with provenance", () => {
  const result = discoverGap(gap(), [
    { source: "lead_intelligence", value: 82, strength: 80 },
    { source: "revenue_memory", value: 82, strength: 75 },
    { source: "weak_source", value: 60, strength: 30 },
  ]);
  assert.equal(result.status, "FOUND");
  assert.equal(result.proposedValue, 82);
  assert.deepEqual(result.provenance, ["lead_intelligence", "revenue_memory"]);
  assert.equal(result.confidence, 85);
  assert.equal(result.writeAllowed, false);
});

test("auto-discoverable gap with no evidence returns NOT_FOUND", () => {
  const result = discoverGap(gap({ field: "source_type" }), []);
  assert.equal(result.status, "NOT_FOUND");
  assert.equal(result.writeAllowed, false);
  assert.deepEqual(result.provenance, []);
});

test("batch discovery preserves one result per requested gap", () => {
  const results = discoverGaps([
    gap({ field: "ai_score" }),
    gap({ field: "due_date", resolution: "HUMAN_REQUIRED" }),
  ], {
    ai_score: [{ source: "work_item", value: 73, strength: 90 }],
    due_date: [{ source: "calendar_hint", value: "2026-09-08", strength: 100 }],
  });
  assert.deepEqual(results.map((item) => item.status), ["FOUND", "SKIPPED_HUMAN_REQUIRED"]);
  assert.ok(results.every((item) => item.writeAllowed === false));
});
