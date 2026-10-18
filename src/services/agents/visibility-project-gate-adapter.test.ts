import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProjectVisibilityReview } from "./visibility-project-gate-adapter";

test("unsupported tax claim blocks quality gate and never authorizes publication", () => {
  const result = evaluateProjectVisibilityReview({
    pageUrl: "https://www.zenecohomes.com/guide/example",
    type: "houseModel",
    directAnswer: "Illustrative description",
    authorName: "Reviewer",
    nextStepUrl: "https://www.zenecohomes.com/booking",
    faqCount: 1,
    facts: [{ key: "taxes", value: "13–14%" }],
  });
  assert.equal(result.gate.status, "REVIEW_BLOCKED");
  assert.ok(result.issues.some(issue => issue.code === "HIGH_RISK_FACT_UNVERIFIED"));
  assert.equal(result.gate.canPublish, false);
  assert.equal(result.canPublish, false);
});

test("missing optional content creates warnings, not false fact verification", () => {
  const result = evaluateProjectVisibilityReview({
    pageUrl: "https://www.zenecohomes.com/eiendommer/example",
    type: "property",
    facts: [],
  });
  assert.equal(result.gate.status, "REVIEW_WARNINGS");
  assert.ok(result.issues.some(issue => issue.code === "MISSING_FAQ"));
  assert.equal(result.publicationEligible, false);
});

test("human-approved source assertion still needs separate release approval", () => {
  const result = evaluateProjectVisibilityReview({
    pageUrl: "https://www.zenecohomes.com/eiendommer/example",
    type: "property",
    directAnswer: "Fact-based answer",
    authorName: "Reviewer",
    nextStepUrl: "https://www.zenecohomes.com/booking",
    faqCount: 2,
    facts: [{ key: "price", value: "349000 EUR", sourceUrl: "https://example.org/evidence", checkedAt: "2026-10-18", verifiedByHuman: true }],
  });
  assert.equal(result.gate.requiresHumanReview, true);
  assert.equal(result.gate.canPublish, false);
});
