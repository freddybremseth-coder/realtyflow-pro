import assert from "node:assert/strict";
import test from "node:test";
import { decideBuyerProfileDraftPromotion, type ReviewedDraftCriterion } from "./buyer-profile-draft-promotion";

const completeContact = {
  email: "buyer@example.com",
  phone: null,
  pipeline_value: 450000,
  property_interest: "Altea",
  preferred_location: null,
  next_followup: "2026-09-10T10:00:00.000Z",
};

const completeCriteria: ReviewedDraftCriterion[] = [
  { key: "property_type", other_key: null, approval_status: "approved", active: true },
  { key: "bedrooms", other_key: null, approval_status: "approved", active: true },
  { key: "other", other_key: "purchase timeline", approval_status: "approved", active: true },
];

test("complete explicitly approved draft can be promoted", () => {
  const decision = decideBuyerProfileDraftPromotion({ contact: completeContact, criteria: completeCriteria });
  assert.equal(decision.canPromote, true);
  assert.equal(decision.completeness.score, 100);
  assert.equal(decision.pendingCount, 0);
  assert.equal(decision.editedActiveCount, 0);
});

test("pending active criterion blocks promotion", () => {
  const decision = decideBuyerProfileDraftPromotion({
    contact: completeContact,
    criteria: [{ ...completeCriteria[0], approval_status: "pending" }, ...completeCriteria.slice(1)],
  });
  assert.equal(decision.canPromote, false);
  assert.equal(decision.pendingCount, 1);
  assert.match(decision.reason, /explicit approval/i);
});

test("edited active criterion still requires explicit approval", () => {
  const decision = decideBuyerProfileDraftPromotion({
    contact: completeContact,
    criteria: [{ ...completeCriteria[0], approval_status: "edited" }, ...completeCriteria.slice(1)],
  });
  assert.equal(decision.canPromote, false);
  assert.equal(decision.editedActiveCount, 1);
  assert.match(decision.reason, /explicit approval/i);
});

test("incomplete Customer 360 profile blocks promotion even when criteria are approved", () => {
  const decision = decideBuyerProfileDraftPromotion({
    contact: { ...completeContact, pipeline_value: 0 },
    criteria: completeCriteria,
  });
  assert.equal(decision.canPromote, false);
  assert.equal(decision.completeness.score, 86);
  assert.ok(decision.completeness.missing.includes("Budsjett"));
});

test("rejected active criterion blocks promotion", () => {
  const decision = decideBuyerProfileDraftPromotion({
    contact: completeContact,
    criteria: [{ ...completeCriteria[0], approval_status: "rejected" }, ...completeCriteria.slice(1)],
  });
  assert.equal(decision.canPromote, false);
  assert.equal(decision.rejectedActiveCount, 1);
});

test("inactive rejected criterion does not block if remaining approved evidence is complete", () => {
  const decision = decideBuyerProfileDraftPromotion({
    contact: completeContact,
    criteria: [...completeCriteria, { key: "bathrooms", other_key: null, approval_status: "rejected", active: false }],
  });
  assert.equal(decision.canPromote, true);
});
