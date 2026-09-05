import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confidenceFromSignal,
  revenuePriorityConfidence,
  revenueWorkConfidence,
  scoreEvidenceConfidence,
} from "@/lib/morning-brief-confidence";

test("confidence scoring is transparent and bounded", () => {
  const result = scoreEvidenceConfidence({ sourceStrength: 100, fieldCoverage: 80, specificity: 70 });
  assert.equal(result.score, 86);
  assert.equal(result.label, "HIGH");

  const bounded = scoreEvidenceConfidence({ sourceStrength: 500, fieldCoverage: -20, specificity: Number.NaN });
  assert.equal(bounded.score, 40);
  assert.equal(bounded.label, "LOW");
});

test("complete revenue lead evidence earns high confidence", () => {
  const result = revenuePriorityConfidence({
    score: 91,
    value: 800000,
    stage: "NEGOTIATION",
    nextFollowupAt: "2026-09-05T10:00:00Z",
    isOverdue: false,
  });
  assert.equal(result.score, 99);
  assert.equal(result.label, "HIGH");
});

test("thin work-item evidence is visibly lower confidence", () => {
  const result = revenueWorkConfidence({ priority: "HIGH" });
  assert.equal(result.label, "LOW");
  assert.ok(result.score < 60);
});

test("generic derived signal does not look as certain as canonical evidence", () => {
  const result = confidenceFromSignal({ sourceStrength: 75, evidenceCount: 1 });
  assert.equal(result.label, "LOW");
});
