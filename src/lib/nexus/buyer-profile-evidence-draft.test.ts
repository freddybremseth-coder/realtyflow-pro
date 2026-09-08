import assert from "node:assert/strict";
import test from "node:test";
import { decideBuyerProfileEvidenceDraft } from "./buyer-profile-evidence-draft";

const propertyType = {
  key: "property_type" as const,
  otherKey: null,
  operator: "eq" as const,
  value: "villa",
  confidence: 0.98,
  source: "notes" as const,
  sourceText: "Customer explicitly wants a villa in Altea.",
};

const bedrooms = {
  key: "bedrooms" as const,
  otherKey: null,
  operator: "gte" as const,
  value: 3,
  confidence: 0.99,
  source: "interactions" as const,
  sourceText: "Minimum 3 bedrooms.",
};

const purchaseTimeline = {
  key: "other" as const,
  otherKey: "purchase timeline",
  operator: "eq" as const,
  value: "within_3_months",
  confidence: 0.97,
  source: "notes" as const,
  sourceText: "Customer wants to buy within 3 months.",
};

test("high-confidence explicit evidence becomes pending draft preferences", () => {
  const decision = decideBuyerProfileEvidenceDraft({ candidates: [propertyType, bedrooms], conflictCount: 0 });
  assert.equal(decision.eligible, true);
  assert.equal(decision.profileStatus, "draft");
  assert.equal(decision.requiresReview, true);
  assert.equal(decision.criteria.length, 2);
  for (const criterion of decision.criteria) {
    assert.equal(criterion.criterionType, "preference");
    assert.equal(criterion.source, "ai_suggestion");
    assert.equal(criterion.approvalStatus, "pending");
    assert.equal(criterion.customerConfirmed, false);
    assert.equal(criterion.approvedBy, null);
    assert.equal(criterion.approvedAt, null);
  }
});

test("purchase timeline remains a pending other criterion instead of being dropped", () => {
  const decision = decideBuyerProfileEvidenceDraft({ candidates: [purchaseTimeline], conflictCount: 0 });
  assert.equal(decision.eligible, true);
  assert.equal(decision.criteria.length, 1);
  assert.equal(decision.criteria[0]?.key, "other");
  assert.equal(decision.criteria[0]?.otherKey, "purchase timeline");
  assert.equal(decision.criteria[0]?.operator, "eq");
  assert.equal(decision.criteria[0]?.value, "within_3_months");
  assert.equal(decision.criteria[0]?.confidence, 0.97);
  assert.equal(decision.criteria[0]?.criterionType, "preference");
  assert.equal(decision.criteria[0]?.approvalStatus, "pending");
});

test("conflicting evidence blocks draft persistence", () => {
  const decision = decideBuyerProfileEvidenceDraft({ candidates: [propertyType], conflictCount: 1 });
  assert.equal(decision.eligible, false);
  assert.equal(decision.criteria.length, 0);
  assert.match(decision.reason, /conflicts/i);
});

test("sub-threshold evidence is not persisted", () => {
  const decision = decideBuyerProfileEvidenceDraft({
    candidates: [{ ...propertyType, confidence: 0.94 }],
    conflictCount: 0,
  });
  assert.equal(decision.eligible, false);
  assert.equal(decision.criteria.length, 0);
});

test("explicit minimum bedrooms remains a pending preference until review", () => {
  const decision = decideBuyerProfileEvidenceDraft({ candidates: [bedrooms], conflictCount: 0 });
  assert.equal(decision.criteria[0]?.operator, "gte");
  assert.equal(decision.criteria[0]?.criterionType, "preference");
  assert.equal(decision.criteria[0]?.approvalStatus, "pending");
});
