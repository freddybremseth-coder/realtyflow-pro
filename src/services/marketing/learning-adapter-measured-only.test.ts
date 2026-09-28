import assert from "node:assert/strict";
import test from "node:test";
import { hasLearningEvidence, learningEligible } from "@/services/marketing/learning-adapter";

test("a learning-eligible zero metrics snapshot is still a real measured observation", () => {
  assert.equal(hasLearningEvidence([
    {
      eventType: "metrics_snapshot",
      metrics: { impressions: 0, views: 0, clicks: 0 },
      metadata: { learning_eligible: true },
    },
  ]), true);
});

test("an unmeasured content event cannot become an artificial zero-value learning observation", () => {
  assert.equal(hasLearningEvidence([
    {
      eventType: "content_created",
      metrics: null,
      metadata: {},
    },
  ]), false);
});

test("quarantined metrics alone are excluded from learning", () => {
  const row = {
    eventType: "metrics_snapshot",
    metrics: { impressions: 1000, clicks: 100 },
    metadata: { learning_eligible: false },
  };
  assert.equal(learningEligible(row), false);
  assert.equal(hasLearningEvidence([row]), false);
});

test("canonical business outcome keeps a content observation even without channel metrics", () => {
  assert.equal(hasLearningEvidence([], {
    leads: 1,
    qualifiedLeads: 1,
    sales: 0,
    commissionEur: 0,
  }), true);
});

test("empty canonical outcome does not manufacture learning evidence", () => {
  assert.equal(hasLearningEvidence([], {
    leads: 0,
    qualifiedLeads: 0,
    viewings: 0,
    offers: 0,
    sales: 0,
    commissionEur: 0,
  }), false);
});
