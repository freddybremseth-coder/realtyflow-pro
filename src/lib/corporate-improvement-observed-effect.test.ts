import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateGrowthReview } from "./corporate-growth-review";
import {
  buildCorporateImprovementObservedEffect,
  buildCorporateImprovementRecurrence,
  corporateStageFromCandidateId,
} from "./corporate-improvement-observed-effect";

function row(createdAt: string, offers: number) {
  return {
    created_at: createdAt,
    details: {
      review: buildCorporateGrowthReview({
        totalProspects: 100,
        contacted: 90,
        meetings: 80,
        opportunities: 20,
        viewingCompanies: 10,
        offerCompanies: offers,
        revenueEventsReady: true,
      }),
    },
  };
}

test("measures post-improvement funnel movement after two new snapshots", () => {
  const effect = buildCorporateImprovementObservedEffect(
    [
      row("2026-09-01T07:30:00.000Z", 2),
      row("2026-09-08T07:30:00.000Z", 3),
      row("2026-09-15T07:30:00.000Z", 4),
    ],
    {
      candidateId: "SALES:SOURCE_BOTTLENECK:CORPORATE_HOMES:viewing_to_offer",
      createdAt: "2026-09-02T10:00:00.000Z",
    },
  );

  assert.ok(effect);
  assert.equal(effect.status, "MEASURED_UP");
  assert.equal(effect.baselineRatePct, 20);
  assert.equal(effect.postSnapshots, 2);
  assert.equal(effect.postAveragePct, 35);
  assert.equal(effect.deltaPctPoints, 15);
  assert.match(effect.note, /ikke at tiltaket forårsaket/i);
});

test("requires two post-improvement snapshots before showing direction", () => {
  const effect = buildCorporateImprovementObservedEffect(
    [
      row("2026-09-01T07:30:00.000Z", 2),
      row("2026-09-08T07:30:00.000Z", 3),
    ],
    {
      candidateId: "SALES:SOURCE_BOTTLENECK:CORPORATE_HOMES:viewing_to_offer",
      createdAt: "2026-09-02T10:00:00.000Z",
    },
  );

  assert.ok(effect);
  assert.equal(effect.status, "NOT_ENOUGH_DATA");
  assert.equal(effect.postSnapshots, 1);
  assert.equal(effect.deltaPctPoints, null);
});

test("ignores non-Corporate candidate ids", () => {
  assert.equal(corporateStageFromCandidateId("SALES:SOURCE_BOTTLENECK:OTHER:x"), null);
  assert.equal(
    buildCorporateImprovementObservedEffect([], {
      candidateId: "SALES:SOURCE_BOTTLENECK:OTHER:x",
      createdAt: "2026-09-02T10:00:00.000Z",
    }),
    null,
  );
});


test("detects repeated Corporate bottleneck after a closed improvement", () => {
  const recurrence = buildCorporateImprovementRecurrence(
    [
      row("2026-09-01T07:30:00.000Z", 4),
      row("2026-09-08T07:30:00.000Z", 1),
      row("2026-09-15T07:30:00.000Z", 1),
    ],
    {
      candidateId: "SALES:SOURCE_BOTTLENECK:CORPORATE_HOMES:viewing_to_offer",
      closedAt: "2026-09-05T12:00:00.000Z",
    },
  );

  assert.ok(recurrence);
  assert.equal(recurrence.detected, true);
  assert.equal(recurrence.postClosureSnapshots, 2);
  assert.equal(recurrence.firstRecurrenceAt, "2026-09-08T07:30:00.000Z");
  assert.equal(recurrence.latestAt, "2026-09-15T07:30:00.000Z");
  assert.match(recurrence.note, /menneskelig vurdering/i);
});

test("does not flag recurrence after only one matching post-closure snapshot", () => {
  const recurrence = buildCorporateImprovementRecurrence(
    [
      row("2026-09-01T07:30:00.000Z", 4),
      row("2026-09-08T07:30:00.000Z", 1),
    ],
    {
      candidateId: "SALES:SOURCE_BOTTLENECK:CORPORATE_HOMES:viewing_to_offer",
      closedAt: "2026-09-05T12:00:00.000Z",
    },
  );

  assert.ok(recurrence);
  assert.equal(recurrence.detected, false);
  assert.equal(recurrence.postClosureSnapshots, 1);
  assert.equal(recurrence.firstRecurrenceAt, null);
});

test("changed latest bottleneck does not count as recurrence", () => {
  const current = {
    created_at: "2026-09-15T07:30:00.000Z",
    details: {
      review: buildCorporateGrowthReview({
        totalProspects: 100,
        contacted: 10,
        meetings: 10,
        opportunities: 10,
        viewingCompanies: 10,
        offerCompanies: 10,
        revenueEventsReady: true,
      }),
    },
  };
  const recurrence = buildCorporateImprovementRecurrence(
    [row("2026-09-08T07:30:00.000Z", 1), current],
    {
      candidateId: "SALES:SOURCE_BOTTLENECK:CORPORATE_HOMES:viewing_to_offer",
      closedAt: "2026-09-05T12:00:00.000Z",
    },
  );

  assert.ok(recurrence);
  assert.equal(recurrence.detected, false);
  assert.equal(recurrence.postClosureSnapshots, 0);
});
