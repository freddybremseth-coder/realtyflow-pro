import assert from "node:assert/strict";
import { test } from "node:test";
import { dataGapSummary, partitionDataGaps, revenuePriorityDataGaps, revenueWorkDataGaps } from "@/lib/morning-brief-data-gaps";

test("revenue lead gaps identify missing value and next follow-up", () => {
  const gaps = revenuePriorityDataGaps({ score: 88, value: 0, stage: "NEGOTIATION", nextFollowupAt: null });
  assert.deepEqual(gaps.map((gap) => gap.field), ["pipeline_value", "next_followup"]);
  assert.ok(gaps.every((gap) => gap.resolution === "HUMAN_REQUIRED"));
  assert.match(dataGapSummary(gaps, 62) || "", /Pipeline value is missing/);
});

test("complete revenue lead has no data gap recommendation", () => {
  const gaps = revenuePriorityDataGaps({ score: 91, value: 800000, stage: "NEGOTIATION", nextFollowupAt: "2026-09-06T10:00:00Z" });
  assert.equal(gaps.length, 0);
  assert.equal(dataGapSummary(gaps, 94), null);
});

test("work gaps separate owner judgement from discoverable system evidence", () => {
  const gaps = revenueWorkDataGaps({ priority: "HIGH", dueAt: null, aiScore: 0, sourceType: "" });
  assert.deepEqual(gaps.map((gap) => gap.field), ["due_date", "ai_score", "source_type"]);
  const partitioned = partitionDataGaps(gaps);
  assert.deepEqual(partitioned.humanRequired.map((gap) => gap.field), ["due_date"]);
  assert.deepEqual(partitioned.autoDiscoverable.map((gap) => gap.field), ["ai_score", "source_type"]);
});

test("auto-discoverable never means autonomous write permission", () => {
  const gaps = revenueWorkDataGaps({ priority: "HIGH", dueAt: "2026-09-06T10:00:00Z", aiScore: 0, sourceType: "" });
  for (const gap of gaps) {
    assert.equal(gap.resolution, "AUTO_DISCOVERABLE");
    assert.match(gap.rationale, /discover/i);
    assert.doesNotMatch(gap.rationale, /write|update|repair/i);
  }
});
