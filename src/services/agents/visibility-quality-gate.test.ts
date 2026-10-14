import test from "node:test";
import assert from "node:assert/strict";
import { evaluateVisibilityGate, recommendContentAction } from "./visibility-quality-gate";

test("critical technical fault blocks publishing even if approved", () => {
  const result = evaluateVisibilityGate({ issues: [{ code: "BROKEN_INTERNAL_LINK", evidence: "404 /guide/missing" }], isSitewideChange: false, isHighRiskTopic: false, humanApproved: true });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.canPublish, false);
});
test("editorial warning does not block publishing", () => {
  const result = evaluateVisibilityGate({ issues: [{ code: "METADATA_LENGTH", evidence: "title 68 chars" }], isSitewideChange: false, isHighRiskTopic: false, humanApproved: false });
  assert.equal(result.status, "APPROVED_WITH_WARNINGS");
  assert.equal(result.canPublish, true);
});
test("global or high-risk change needs human approval", () => {
  for (const field of ["isSitewideChange", "isHighRiskTopic"] as const) {
    const input = { issues: [], isSitewideChange: false, isHighRiskTopic: false, humanApproved: false, [field]: true };
    assert.equal(evaluateVisibilityGate(input).status, "REVIEW_REQUIRED");
    assert.equal(evaluateVisibilityGate({ ...input, humanApproved: true }).canPublish, true);
  }
});
test("unverified high-risk facts block regardless of human-approved flag", () => {
  const result = evaluateVisibilityGate({ issues: [{ code: "HIGH_RISK_FACT_UNVERIFIED", evidence: "no primary source for tax rate" }], isSitewideChange: false, isHighRiskTopic: true, humanApproved: true });
  assert.equal(result.canPublish, false);
});
test("same user intent consolidates; distinct customer journey stays separate", () => {
  assert.equal(recommendContentAction({ samePrimaryQuestion: true, sameUserNeed: true, distinctJourneyPurpose: false, existingPageCoversTopic: true, existingPageNeedsUpdate: false }), "MERGE");
  assert.equal(recommendContentAction({ samePrimaryQuestion: true, sameUserNeed: true, distinctJourneyPurpose: true, existingPageCoversTopic: true, existingPageNeedsUpdate: false }), "KEEP_BOTH");
});
