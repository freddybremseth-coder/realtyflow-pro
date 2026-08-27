import test from "node:test";
import assert from "node:assert/strict";
import { buildBuyerIntakeLifestyleCriteria, mergeBuyerIntakeCriteria } from "./nexus-buyer-intake-approval";

test("converts explicit lifestyle evidence into namespaced preference criteria", () => {
  const criteria = buildBuyerIntakeLifestyleCriteria([
    { key: "lifestyle:beach", value: true, strength: "strong_preference", sourceText: "strand", customerConfirmed: true },
    { key: "mobility:car_ok", value: true, strength: "nice_to_have", sourceText: "bil ok", customerConfirmed: true },
  ]);

  assert.equal(criteria.length, 2);
  assert.equal(criteria[0].key, "other");
  assert.equal(criteria[0].otherKey, "lifestyle:beach");
  assert.equal(criteria[0].weight, 0.85);
  assert.equal(criteria[1].weight, 0.6);
  assert.equal(criteria[0].customerConfirmed, true);
});

test("preserves existing criteria while replacing the same lifestyle namespace with fresh evidence", () => {
  const result = mergeBuyerIntakeCriteria({
    existingCriteria: [
      {
        criterion_type: "hard_requirement",
        key: "bedrooms",
        operator: "gte",
        value: 3,
        active: true,
        customer_confirmed: true,
      },
      {
        criterion_type: "preference",
        key: "other",
        other_key: "lifestyle:beach",
        operator: "eq",
        value: false,
        weight: 0.5,
        source_text: "older evidence",
        active: true,
      },
    ],
    lifestyleCandidates: [
      { key: "lifestyle:beach", value: true, strength: "strong_preference", sourceText: "strand", customerConfirmed: true },
    ],
  });

  assert.equal(result.mergedCriteria.length, 2);
  assert.equal(result.mergedCriteria.find((criterion) => criterion.key === "bedrooms")?.value, 3);
  const beach = result.mergedCriteria.find((criterion) => criterion.otherKey === "lifestyle:beach");
  assert.equal(beach?.value, true);
  assert.equal(beach?.sourceText, "strand");
  assert.equal(beach?.weight, 0.85);
});

test("does not promote explicitly unconfirmed candidates", () => {
  const criteria = buildBuyerIntakeLifestyleCriteria([
    { key: "social:scandinavian", value: true, sourceText: "possible", customerConfirmed: false },
  ]);
  assert.equal(criteria.length, 0);
});
