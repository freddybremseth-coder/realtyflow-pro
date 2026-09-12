import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerTasteProfile, rankMatchesWithCustomerTaste } from "./customer-taste-profile";

const interactions = [
  {
    type: "property_feedback",
    metadata: {
      signals: [
        { location: "Moraira", sentiment: "positive", reasons: ["other"] },
        { location: "Calpe", sentiment: "negative", reasons: ["location_dislike"] },
        { location: "Altea", sentiment: "negative", reasons: ["price_high"] },
      ],
    },
  },
  {
    type: "property_feedback",
    metadata: {
      signals: [
        { location: "Moraira", sentiment: "viewing", reasons: ["viewing_requested"] },
        { location: "Calpe", sentiment: "negative", reasons: ["location_dislike"] },
        { location: "Altea", sentiment: "negative", reasons: ["price_high"] },
      ],
    },
  },
];

test("builds learned taste only from repeated property feedback", () => {
  const profile = buildCustomerTasteProfile(interactions, new Date("2026-09-12T18:00:00Z"));
  assert.equal(profile.feedbackEvents, 2);
  assert.equal(profile.preferredLocations[0]?.location, "Moraira");
  assert.equal(profile.avoidedLocations[0]?.location, "Calpe");
  assert.equal(profile.priceSensitivity, "price_sensitive");
  assert.equal(profile.safety.secondaryRankingOnly, true);
  assert.equal(profile.safety.overridesExplicitBuyerCriteria, false);
  assert.equal(profile.safety.changesEligibility, false);
});

test("taste reorders only inside the same eligibility band", () => {
  const profile = buildCustomerTasteProfile(interactions);
  const ranked = rankMatchesWithCustomerTaste([
    { score: 88, eligibility: "eligible" as const, property: { id: "calpe", location: "Calpe", price: 590000 } },
    { score: 86, eligibility: "eligible" as const, property: { id: "moraira", location: "Moraira", price: 540000 } },
    { score: 99, eligibility: "conditional" as const, property: { id: "conditional", location: "Moraira", price: 500000 } },
  ], profile, { budgetAmount: 600000 });

  assert.equal(ranked[0].property.id, "moraira");
  assert.equal(ranked[1].property.id, "calpe");
  assert.equal(ranked[2].property.id, "conditional");
  assert.equal(ranked[2].eligibility, "conditional");
  assert.equal(ranked.some((item) => Math.abs(item.tasteAdjustment) > 6), false);
});

test("one-off feedback does not change ranking", () => {
  const profile = buildCustomerTasteProfile([
    { type: "property_feedback", metadata: { signals: [{ location: "Moraira", sentiment: "positive", reasons: [] }] } },
  ]);
  const ranked = rankMatchesWithCustomerTaste([
    { score: 80, eligibility: "eligible" as const, property: { id: "a", location: "Moraira", price: 500000 } },
    { score: 81, eligibility: "eligible" as const, property: { id: "b", location: "Altea", price: 500000 } },
  ], profile, { budgetAmount: 600000 });
  assert.deepEqual(ranked.map((item) => item.property.id), ["a", "b"]);
  assert.deepEqual(ranked.map((item) => item.tasteAdjustment), [0, 0]);
});
