import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateGrowthReview, compareCorporateGrowthReview } from "./corporate-growth-review";

test("selects the lowest measured funnel conversion without changing budget", () => {
  const review = buildCorporateGrowthReview({
    totalProspects: 40,
    contacted: 20,
    meetings: 12,
    opportunities: 8,
    viewingCompanies: 5,
    offerCompanies: 1,
    revenueEventsReady: true,
  });

  assert.equal(review.status, "READY");
  assert.equal(review.bottleneck?.stage, "viewing_to_offer");
  assert.equal(review.bottleneck?.ratePct, 20);
  assert.equal(review.guardrails.automaticBudgetChanges, false);
  assert.equal(review.guardrails.automaticOutreach, false);
  assert.match(review.nextFocus, /boligfit|pris|innvendinger/i);
});

test("stays in learning mode when samples are too small", () => {
  const review = buildCorporateGrowthReview({
    totalProspects: 4,
    contacted: 2,
    meetings: 1,
    opportunities: 1,
    viewingCompanies: 0,
    offerCompanies: 0,
    revenueEventsReady: true,
  });

  assert.equal(review.status, "LEARNING");
  assert.equal(review.bottleneck, null);
  assert.match(review.evidenceNote, /minst 5 observasjoner/i);
});

test("fails closed when canonical revenue outcomes are unavailable", () => {
  const review = buildCorporateGrowthReview({
    totalProspects: 50,
    contacted: 20,
    meetings: 10,
    opportunities: 8,
    viewingCompanies: 0,
    offerCompanies: 0,
    revenueEventsReady: false,
  });

  assert.equal(review.status, "DATA_GAP");
  assert.equal(review.bottleneck, null);
  assert.match(review.nextFocus, /Revenue OS/i);
});


test("repeated bottleneck becomes a manual continuous-improvement candidate", () => {
  const current = buildCorporateGrowthReview({
    totalProspects: 50,
    contacted: 30,
    meetings: 20,
    opportunities: 10,
    viewingCompanies: 5,
    offerCompanies: 1,
    revenueEventsReady: true,
  });
  const previousOne = buildCorporateGrowthReview({
    totalProspects: 45,
    contacted: 28,
    meetings: 18,
    opportunities: 9,
    viewingCompanies: 5,
    offerCompanies: 1,
    revenueEventsReady: true,
  });
  const previousTwo = buildCorporateGrowthReview({
    totalProspects: 40,
    contacted: 25,
    meetings: 16,
    opportunities: 8,
    viewingCompanies: 5,
    offerCompanies: 1,
    revenueEventsReady: true,
  });

  const comparison = compareCorporateGrowthReview(current, [previousOne, previousTwo]);
  assert.equal(comparison.sameBottleneckStreak, 3);
  assert.equal(comparison.continuousImprovementCandidate, true);
  assert.equal(comparison.previousBottleneckStage, current.bottleneck?.stage);
  assert.equal(typeof comparison.rateDeltaPctPoints, "number");
  assert.match(comparison.note, /menneskelig vurdering/i);
});

test("changed bottleneck resets the repetition streak", () => {
  const current = buildCorporateGrowthReview({
    totalProspects: 50,
    contacted: 5,
    meetings: 5,
    opportunities: 5,
    viewingCompanies: 5,
    offerCompanies: 5,
    revenueEventsReady: true,
  });
  const previous = buildCorporateGrowthReview({
    totalProspects: 50,
    contacted: 30,
    meetings: 20,
    opportunities: 10,
    viewingCompanies: 5,
    offerCompanies: 1,
    revenueEventsReady: true,
  });

  const comparison = compareCorporateGrowthReview(current, [previous]);
  assert.equal(comparison.sameBottleneckStreak, 1);
  assert.equal(comparison.continuousImprovementCandidate, false);
  assert.equal(comparison.rateDeltaPctPoints, null);
});

test("non-ready review never becomes an improvement candidate", () => {
  const current = buildCorporateGrowthReview({
    totalProspects: 4,
    contacted: 2,
    meetings: 1,
    opportunities: 1,
    viewingCompanies: 0,
    offerCompanies: 0,
    revenueEventsReady: true,
  });
  const comparison = compareCorporateGrowthReview(current, []);
  assert.equal(comparison.sameBottleneckStreak, 0);
  assert.equal(comparison.continuousImprovementCandidate, false);
});
