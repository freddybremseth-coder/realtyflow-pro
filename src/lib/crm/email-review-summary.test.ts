import assert from "node:assert/strict";
import test from "node:test";
import { summarizeEmailIdentityReviewPriorities } from "./email-review-summary";

test("review priority summary counts only classified CRM review items", () => {
  const summary = summarizeEmailIdentityReviewPriorities([
    { priority: "high", reason: "h1" },
    { priority: "medium", reason: "m1" },
    { priority: "low", reason: "l1" },
    { priority: "low", reason: "l2" },
  ]);

  assert.deepEqual(summary, { high: 1, medium: 1, low: 2, total: 4 });
});

test("empty review queue returns zero counts", () => {
  assert.deepEqual(summarizeEmailIdentityReviewPriorities([]), { high: 0, medium: 0, low: 0, total: 0 });
});
