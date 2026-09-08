import assert from "node:assert/strict";
import test from "node:test";
import { buildBuyerProfileEvidencePreview, type BuyerProfileEvidenceInput } from "./buyer-profile-evidence";

function completeContact(overrides: Partial<BuyerProfileEvidenceInput> = {}): BuyerProfileEvidenceInput {
  return {
    email: "buyer@example.com",
    pipeline_value: 450000,
    property_interest: "Altea villa",
    next_followup: "2026-09-10T09:00:00.000Z",
    notes: "Looking for minimum 3 bedrooms and wants to buy within 6 months.",
    interactions: [],
    ...overrides,
  };
}

test("explicit property type, bedrooms and timeline project Customer 360 to complete", () => {
  const preview = buildBuyerProfileEvidencePreview(completeContact());
  assert.equal(preview.readOnly, true);
  assert.equal(preview.safeForAutoPersistence, false);
  assert.equal(preview.conflicts.length, 0);
  assert.equal(preview.candidates.find((item) => item.key === "property_type")?.value, "villa");
  assert.equal(preview.candidates.find((item) => item.key === "bedrooms")?.value, 3);
  assert.equal(preview.candidates.find((item) => item.key === "bedrooms")?.operator, "gte");
  assert.equal(preview.candidates.find((item) => item.otherKey === "purchase timeline")?.value, "within_6_months");
  assert.equal(preview.projectedCompleteness.score, 100);
  assert.equal(preview.projectedProfileComplete, true);
});

test("multiple property types create a conflict instead of a persisted candidate", () => {
  const preview = buildBuyerProfileEvidencePreview(completeContact({
    property_interest: "Villa or apartment in Altea",
  }));
  assert.equal(preview.candidates.some((item) => item.key === "property_type"), false);
  assert.equal(preview.conflicts.some((item) => item.field === "property_type"), true);
  assert.ok(preview.projectedCompleteness.score < 100);
});

test("bedroom ranges are review-only conflicts", () => {
  const preview = buildBuyerProfileEvidencePreview(completeContact({
    notes: "Looking for 2-3 bedrooms and wants to buy within 6 months.",
  }));
  assert.equal(preview.candidates.some((item) => item.key === "bedrooms"), false);
  assert.equal(preview.conflicts.some((item) => item.field === "bedrooms"), true);
});

test("conflicting timelines do not become a projected criterion", () => {
  const preview = buildBuyerProfileEvidencePreview(completeContact({
    notes: "We want to buy this year, perhaps next year.",
  }));
  assert.equal(preview.candidates.some((item) => item.otherKey === "purchase timeline"), false);
  assert.equal(preview.conflicts.some((item) => item.field === "purchase_timeline"), true);
});

test("weak CRM data remains incomplete and does not invent evidence", () => {
  const preview = buildBuyerProfileEvidencePreview({
    email: "buyer@example.com",
    notes: "Please send some options.",
    interactions: [],
  });
  assert.equal(preview.candidates.length, 0);
  assert.equal(preview.conflicts.length, 0);
  assert.ok(preview.projectedCompleteness.score < 100);
  assert.equal(preview.projectedProfileComplete, false);
});
