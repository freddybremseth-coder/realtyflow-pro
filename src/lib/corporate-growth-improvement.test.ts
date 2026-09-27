import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorporateGrowthImprovementCandidate,
  corporateGrowthCandidateId,
} from "./corporate-growth-improvement";
import {
  buildContinuousImprovementRegister,
  createImprovementSnapshot,
  makeImprovementEvent,
} from "./revenue/continuous-improvement";

function reviewRow(createdAt: string, rate: number, streak: number) {
  return {
    created_at: createdAt,
    details: {
      review: {
        version: 1,
        kind: "corporate_growth_review",
        status: "READY",
        window: "current_pipeline_snapshot",
        minimumDenominator: 5,
        bottleneck: {
          stage: "viewing_to_offer",
          label: "Faktisk visning → faktisk tilbud",
          numerator: 1,
          denominator: 5,
          ratePct: rate,
          confidence: "LOW",
        },
        measuredStages: [],
        nextFocus: "Undersøk boligfit, pris og innvendinger.",
        evidenceNote: "Dokumentert Revenue OS-grunnlag.",
        guardrails: {
          readOnly: true,
          automaticBudgetChanges: false,
          automaticOutreach: false,
          inferredOutcomes: false,
        },
      },
      comparison: {
        previousBottleneckStage: "viewing_to_offer",
        previousRatePct: 20,
        rateDeltaPctPoints: rate - 20,
        sameBottleneckStreak: streak,
        continuousImprovementCandidate: streak >= 2,
        note: "Menneskelig vurdering.",
      },
    },
  };
}

test("builds a stable SALES improvement candidate after repeated Corporate bottleneck", () => {
  const candidate = buildCorporateGrowthImprovementCandidate([
    reviewRow("2026-09-28T07:30:00.000Z", 20, 2),
    reviewRow("2026-09-21T07:30:00.000Z", 20, 1),
  ]);
  assert.ok(candidate);
  assert.equal(candidate.id, corporateGrowthCandidateId("viewing_to_offer"));
  assert.equal(candidate.role, "SALES");
  assert.equal(candidate.source, "SALES");
  assert.equal(candidate.issueType, "SOURCE_BOTTLENECK");
  assert.equal(candidate.occurrenceWeeks, 2);
  assert.equal(candidate.existingImprovementId, null);
  assert.match(candidate.detail, /ikke dokumentasjon på årsakssammenheng/i);
});

test("does not create a candidate from a single weekly bottleneck", () => {
  const candidate = buildCorporateGrowthImprovementCandidate([
    reviewRow("2026-09-28T07:30:00.000Z", 20, 1),
  ]);
  assert.equal(candidate, null);
});

test("additional Corporate candidate is visible by role and remains manual to create", () => {
  const candidate = buildCorporateGrowthImprovementCandidate([
    reviewRow("2026-09-28T07:30:00.000Z", 20, 2),
    reviewRow("2026-09-21T07:30:00.000Z", 20, 1),
  ]);
  assert.ok(candidate);
  const weekly = { version: 1 as const, events: [], updatedAt: null };
  const empty = { version: 1 as const, events: [], updatedAt: null };

  const sales = buildContinuousImprovementRegister(empty, weekly, "SALES", new Date("2026-09-28T09:00:00Z"), [candidate]);
  const finance = buildContinuousImprovementRegister(empty, weekly, "FINANCE", new Date("2026-09-28T09:00:00Z"), [candidate]);
  const owner = buildContinuousImprovementRegister(empty, weekly, "OWNER", new Date("2026-09-28T09:00:00Z"), [candidate]);
  assert.equal(sales.candidates.some((item) => item.id === candidate.id), true);
  assert.equal(owner.candidates.some((item) => item.id === candidate.id), true);
  assert.equal(finance.candidates.some((item) => item.id === candidate.id), false);
  assert.equal(sales.safety.automaticTaskCreation, false);

  const snapshot = createImprovementSnapshot(candidate, "owner@example.com", new Date("2026-09-28T09:05:00Z"), "corporate-improvement");
  const created = makeImprovementEvent({
    type: "IMPROVEMENT_CREATED",
    actorEmail: "owner@example.com",
    actorRole: "OWNER",
    improvementId: snapshot.id,
    snapshot,
    previousStatus: null,
    status: null,
    rootCauseCategory: null,
    rootCauseStatement: null,
    actionType: null,
    actionPlan: null,
    dueAt: null,
    ownerEmail: null,
    successMetric: null,
    targetValue: null,
    note: null,
  });
  const tracked = buildContinuousImprovementRegister(
    { version: 1, events: [created], updatedAt: created.at },
    weekly,
    "OWNER",
    new Date("2026-09-28T09:10:00Z"),
    [candidate],
  );
  assert.equal(
    tracked.candidates.find((item) => item.id === candidate.id)?.existingImprovementId,
    snapshot.id,
  );
});
