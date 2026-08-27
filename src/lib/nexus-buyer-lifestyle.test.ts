import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBuyerLifestyleProfile,
  buyerLifestyleDiscoveryGaps,
  parseBuyerLifestyleCriterion,
} from "./nexus-buyer-lifestyle";

test("parses namespaced lifestyle criteria with strength and evidence", () => {
  const parsed = parseBuyerLifestyleCriterion({
    key: "other",
    other_key: "daily_life:beach_walkability",
    criterion_type: "preference",
    value: { value: true },
    weight: 0.95,
    source: "manual",
    source_text: "Vil kunne gå til stranden",
    confidence: 0.9,
    customer_confirmed: true,
    approval_status: "approved",
    active: true,
  });
  assert.equal(parsed?.namespace, "daily_life");
  assert.equal(parsed?.dimension, "beach_walkability");
  assert.equal(parsed?.strength, "must_have");
  assert.equal(parsed?.evidence, "customer_confirmed");
  assert.equal(parsed?.confirmed, true);
});

test("does not treat rejected or non-lifestyle criteria as lifestyle evidence", () => {
  assert.equal(parseBuyerLifestyleCriterion({ key: "bedrooms", value: 3 }), null);
  assert.equal(parseBuyerLifestyleCriterion({
    key: "other",
    other_key: "social:scandinavian",
    value: true,
    approval_status: "rejected",
  }), null);
});

test("keeps inferred preferences separate from confirmed preferences", () => {
  const profile = buildBuyerLifestyleProfile([
    {
      key: "other",
      other_key: "environment:quiet",
      value: true,
      weight: 0.8,
      source: "manual",
      customer_confirmed: true,
    },
    {
      key: "other",
      other_key: "social:scandinavian",
      value: true,
      weight: 0.6,
      source: "ai_inference",
      confidence: 0.55,
      customer_confirmed: false,
    },
  ]);
  assert.equal(profile.confirmed.length, 1);
  assert.equal(profile.inferred.length, 1);
  assert.equal(profile.hasVerifiedLifestyleEvidence, true);
});

test("returns discovery questions only for missing lifestyle dimensions", () => {
  const gaps = buyerLifestyleDiscoveryGaps([
    {
      key: "other",
      other_key: "daily_life:beach_walkability",
      value: true,
      customer_confirmed: true,
    },
  ]);
  assert.equal(gaps.some((item) => item.key === "daily_life:beach_walkability"), false);
  assert.equal(gaps.some((item) => item.key === "environment:quiet"), true);
  assert.equal(gaps.some((item) => item.key === "social:scandinavian"), true);
});
