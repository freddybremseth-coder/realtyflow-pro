import assert from "node:assert/strict";
import { test } from "node:test";
import { dataGapSummary, revenuePriorityDataGaps, revenueWorkDataGaps } from "@/lib/morning-brief-data-gaps";

test("revenue lead gaps identify missing value and next follow-up", () => {
  const gaps = revenuePriorityDataGaps({ score: 88, value: 0, stage: "NEGOTIATION", nextFollowupAt: null });
  assert.deepEqual(gaps.map((gap) => gap.field), ["pipeline_value", "next_followup"]);
  assert.match(dataGapSummary(gaps, 62) || "", /Pipeline value is missing/);
});

test("complete revenue lead has no data gap recommendation", () => {
  const gaps = revenuePriorityDataGaps({ score: 91, value: 800000, stage: "NEGOTIATION", nextFollowupAt: "2026-09-06T10:00:00Z" });
  assert.equal(gaps.length, 0);
  assert.equal(dataGapSummary(gaps, 94), null);
});

test("work gaps identify missing due date and AI score", () => {
  const gaps = revenueWorkDataGaps({ priority: "HIGH", dueAt: null, aiScore: 0, sourceType: "crm" });
  assert.deepEqual(gaps.map((gap) => gap.field), ["due_date", "ai_score"]);
});
