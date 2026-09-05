import assert from "node:assert/strict";
import { test } from "node:test";
import { revenuePriorityEvidenceDimensions, revenueWorkEvidenceDimensions } from "@/lib/morning-brief-evidence";

const now = new Date("2026-09-05T08:00:00Z");

test("high-value overdue closing lead becomes high-impact and owner-required", () => {
  const result = revenuePriorityEvidenceDimensions({
    score: 91,
    value: 800000,
    kind: "closing",
    stage: "NEGOTIATION",
    isOverdue: true,
    nextFollowupAt: "2026-09-04T08:00:00Z",
  }, now);
  assert.equal(result.urgency, 91);
  assert.equal(result.impact, 100);
  assert.equal(result.deadlineOrIrreversibility, 100);
  assert.equal(result.ownerRequired, 95);
  assert.ok(result.evidence.some((item) => item.includes("pipeline value")));
});

test("near-due work item uses canonical due date and priority", () => {
  const result = revenueWorkEvidenceDimensions({
    priority: "HIGH",
    dueAt: "2026-09-05T20:00:00Z",
    aiScore: 76,
    sourceType: "crm",
  }, now);
  assert.equal(result.urgency, 88);
  assert.equal(result.deadlineOrIrreversibility, 92);
  assert.equal(result.ownerRequired, 78);
});
