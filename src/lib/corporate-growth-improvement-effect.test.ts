import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateGrowthImprovementEffect } from "./corporate-growth-improvement-effect";

function row(at: string, ratePct: number, eligible = true) {
  return {
    created_at: at,
    details: {
      review: {
        measuredStages: [
          {
            stage: "viewing_to_offer",
            ratePct,
            eligible,
          },
        ],
      },
    },
  };
}

test("requires baseline and two qualified post snapshots", () => {
  const effect = buildCorporateGrowthImprovementEffect(
    "viewing_to_offer",
    "2026-09-15T10:00:00.000Z",
    [
      row("2026-09-08T07:30:00.000Z", 20),
      row("2026-09-22T07:30:00.000Z", 30),
    ],
  );
  assert.equal(effect.trend, "NOT_ENOUGH_DATA");
  assert.equal(effect.baselineRatePct, 20);
  assert.equal(effect.postSnapshots, 1);
});

test("marks improving when last two qualified snapshots improve by at least ten points", () => {
  const effect = buildCorporateGrowthImprovementEffect(
    "viewing_to_offer",
    "2026-09-15T10:00:00.000Z",
    [
      row("2026-09-08T07:30:00.000Z", 20),
      row("2026-09-22T07:30:00.000Z", 35),
      row("2026-09-29T07:30:00.000Z", 45),
    ],
  );
  assert.equal(effect.trend, "IMPROVING");
  assert.equal(effect.baselineRatePct, 20);
  assert.equal(effect.latestRatePct, 45);
  assert.equal(effect.deltaPctPoints, 20);
});

test("marks worsening when last two qualified snapshots fall by at least ten points", () => {
  const effect = buildCorporateGrowthImprovementEffect(
    "viewing_to_offer",
    "2026-09-15T10:00:00.000Z",
    [
      row("2026-09-08T07:30:00.000Z", 40),
      row("2026-09-22T07:30:00.000Z", 25),
      row("2026-09-29T07:30:00.000Z", 15),
    ],
  );
  assert.equal(effect.trend, "WORSENING");
  assert.equal(effect.deltaPctPoints, -20);
});

test("ignores ineligible snapshots and keeps small movement unchanged", () => {
  const effect = buildCorporateGrowthImprovementEffect(
    "viewing_to_offer",
    "2026-09-15T10:00:00.000Z",
    [
      row("2026-09-08T07:30:00.000Z", 30),
      row("2026-09-22T07:30:00.000Z", 95, false),
      row("2026-09-29T07:30:00.000Z", 34),
      row("2026-10-06T07:30:00.000Z", 38),
    ],
  );
  assert.equal(effect.trend, "UNCHANGED");
  assert.equal(effect.postSnapshots, 2);
  assert.equal(effect.deltaPctPoints, 6);
});
