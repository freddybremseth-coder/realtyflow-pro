import assert from "node:assert/strict";
import test from "node:test";
import { buildRevenueLearningProfile, learningAdjustmentForAction, parseRevenueLearningProfile } from "./revenue-learning";
import type { NexusOutcomeMeasurement } from "./outcome-measurement";

function measurement(): NexusOutcomeMeasurement {
  return {
    generatedAt: "2026-09-12T08:00:00.000Z",
    attributionWindowDays: 30,
    recommendations: [],
    summary: {
      recommendations: 40,
      withOutcome: 12,
      outcomeRate: 30,
      replyRate: 20,
      viewingRate: 10,
      offerRate: 5,
      winRate: 2.5,
      revenueImpactEur: 10000,
      medianHoursToFirstOutcome: 12,
    },
    byActionType: [
      {
        actionType: "general_customer_message",
        recommendations: 25,
        withOutcome: 12,
        outcomeRate: 48,
        replyRate: 40,
        viewingRate: 16,
        offerRate: 8,
        winRate: 4,
        revenueImpactEur: 9000,
      },
      {
        actionType: "closing_decision",
        recommendations: 5,
        withOutcome: 1,
        outcomeRate: 20,
        replyRate: 0,
        viewingRate: 0,
        offerRate: 0,
        winRate: 0,
        revenueImpactEur: 1000,
      },
    ],
    safety: {
      observationalOnly: true,
      policyMutationAllowed: false,
      autonomyExpansionAllowed: false,
    },
  };
}

test("builds bounded ranking signals only when evidence clears the sample floor", () => {
  const profile = buildRevenueLearningProfile(measurement(), { minSamples: 8, generatedAt: new Date("2026-09-12T09:00:00Z") });
  const strong = profile.signals.find((item) => item.actionType === "general_customer_message");
  const weak = profile.signals.find((item) => item.actionType === "closing_decision");

  assert.equal(profile.safety.rankingOnly, true);
  assert.equal(profile.safety.policyMutationAllowed, false);
  assert.equal(profile.safety.autonomyExpansionAllowed, false);
  assert.equal(strong?.evidenceStrength, "established");
  assert.ok((strong?.scoreAdjustment || 0) > 0);
  assert.ok(Math.abs(strong?.scoreAdjustment || 0) <= 8);
  assert.equal(weak?.evidenceStrength, "insufficient");
  assert.equal(weak?.scoreAdjustment, 0);
});

test("learning adjustment cannot exceed the hard score cap", () => {
  const profile = buildRevenueLearningProfile(measurement(), { minSamples: 8 });
  const result = learningAdjustmentForAction("general_customer_message", {
    ...profile,
    signals: profile.signals.map((item) => item.actionType === "general_customer_message" ? { ...item, scoreAdjustment: 99 } : item),
  });
  assert.equal(result.scoreAdjustment, 8);
});

test("parser fails closed when saved learning would allow policy or autonomy mutation", () => {
  const profile = buildRevenueLearningProfile(measurement());
  assert.ok(parseRevenueLearningProfile(profile));
  assert.equal(parseRevenueLearningProfile({ ...profile, safety: { ...profile.safety, policyMutationAllowed: true } }), null);
  assert.equal(parseRevenueLearningProfile({ ...profile, safety: { ...profile.safety, autonomyExpansionAllowed: true } }), null);
});

test("insufficient evidence never changes ranking", () => {
  const profile = buildRevenueLearningProfile(measurement(), { minSamples: 8 });
  const result = learningAdjustmentForAction("closing_decision", profile);
  assert.equal(result.scoreAdjustment, 0);
  assert.equal(result.signal?.evidenceStrength, "insufficient");
});
