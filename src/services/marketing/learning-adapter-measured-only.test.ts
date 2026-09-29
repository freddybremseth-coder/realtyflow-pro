import assert from "node:assert/strict";
import test from "node:test";
import { hasLearningEvidence, learningEligible, learningEvidenceWindow } from "@/services/marketing/learning-adapter";

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


test("non-canonical analytics events do not enter observed learning metrics", () => {
  const row = {
    eventType: "content_viewed",
    metrics: { impressions: 5000, clicks: 300 },
    metadata: { source: "unified_analytics" },
  };
  assert.equal(learningEligible(row), false);
  assert.equal(hasLearningEvidence([row]), false);
});


test("learning evidence window combines canonical snapshots and attributed business outcomes", () => {
  const window = learningEvidenceWindow([
    {
      eventType: "metrics_snapshot",
      metrics: { impressions: 100 },
      metadata: { learning_eligible: true },
      occurredAt: "2026-09-01T10:00:00.000Z",
    },
    {
      eventType: "metrics_snapshot",
      metrics: { impressions: 150 },
      metadata: { learning_eligible: true },
      occurredAt: "2026-09-10T10:00:00.000Z",
    },
    {
      eventType: "content_viewed",
      metrics: { views: 9999 },
      metadata: {},
      occurredAt: "2026-09-20T10:00:00.000Z",
    },
  ], {
    firstAt: "2026-09-05T12:00:00.000Z",
    lastAt: "2026-09-18T12:00:00.000Z",
  });

  assert.deepEqual(window, {
    firstAt: "2026-09-01T10:00:00.000Z",
    lastAt: "2026-09-18T12:00:00.000Z",
  });
});

test("quarantined snapshot time cannot make evidence look fresh", () => {
  const window = learningEvidenceWindow([
    {
      eventType: "metrics_snapshot",
      metrics: { impressions: 100 },
      metadata: { learning_eligible: true },
      occurredAt: "2026-08-01T10:00:00.000Z",
    },
    {
      eventType: "metrics_snapshot",
      metrics: { impressions: 200 },
      metadata: { learning_eligible: false },
      occurredAt: "2026-09-28T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(window, {
    firstAt: "2026-08-01T10:00:00.000Z",
    lastAt: "2026-08-01T10:00:00.000Z",
  });
});
