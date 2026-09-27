import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateGrowthReview } from "./corporate-growth-review";

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
