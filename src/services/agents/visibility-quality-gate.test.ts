import test from "node:test";
import assert from "node:assert/strict";
import { evaluateVisibilityGate, recommendContentAction } from "./visibility-quality-gate";

test("critical technical fault blocks publishing even if approved", () => {
  const result = evaluateVisibilityGate({ issues: [{ code: "BROKEN_INTERNAL_LINK", evidence: "404 /guide/missing" }], isSitewideChange: false, isHighRiskTopic: false, humanApproved: true });
  assert.equal(result.status, "REVIEW_BLOCKED");
  assert.equal(result.canPublish, false);
});
test("editorial warning does not block publishing", () => {
  const result = evaluateVisibilityGate({ issues: [{ code: "METADATA_LENGTH", evidence: "title 68 chars" }], isSitewideChange: false, isHighRiskTopic: false, humanApproved: false });
  assert.equal(result.status, "REVIEW_WARNINGS");
  assert.equal(result.reviewPassed, true);
  assert.equal(result.canPublish, false);
  assert.equal(result.publicationEligible, false);
  assert.equal(result.requiresChangeSpecificPreflight, true);
});
test("global or high-risk change needs human approval", () => {
  for (const field of ["isSitewideChange", "isHighRiskTopic"] as const) {
    const input = { issues: [], isSitewideChange: false, isHighRiskTopic: false, humanApproved: false, [field]: true };
    assert.equal(evaluateVisibilityGate(input).status, "HUMAN_REVIEW_REQUIRED");
    assert.equal(evaluateVisibilityGate({ ...input, humanApproved: true }).reviewPassed, true);
    assert.equal(evaluateVisibilityGate({ ...input, humanApproved: true }).canPublish, false);
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

test("clean supplied issue list never authorizes publication without page-specific preflight", () => {
  const result = evaluateVisibilityGate({ issues: [], isSitewideChange: false, isHighRiskTopic: false, humanApproved: true });
  assert.equal(result.status, "REVIEW_PASSED");
  assert.equal(result.reviewPassed, true);
  assert.equal(result.canPublish, false);
  assert.equal(result.requiresChangeSpecificPreflight, true);
});
test("parseable but misleading schema and unparsable JSON-LD are separate issues", () => {
  const result = evaluateVisibilityGate({
    issues: [{ code: "SCHEMA_PARSE_ERROR", evidence: "invalid JSON-LD" }],
    isSitewideChange: false, isHighRiskTopic: false, humanApproved: false,
  });
  assert.equal(result.status, "REVIEW_WARNINGS");
  assert.equal(result.warnings[0].code, "SCHEMA_PARSE_ERROR");
  assert.equal(result.canPublish, false);
});
