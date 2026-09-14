import assert from "node:assert/strict";
import test from "node:test";
import { selectPropertyDeltaCandidates } from "./nexus-property-delta";

const candidates = [
  { id: "p-new", price: 420000, baseScore: 86 },
  { id: "p-same", price: 500000, baseScore: 82 },
  { id: "p-better", price: 550000, baseScore: 90 },
  { id: "p-price", price: 475000, baseScore: 80 },
];

const history = [
  { property_id: "p-same", property_price: 500000, score: 82, created_at: "2026-09-01T10:00:00.000Z" },
  { property_id: "p-better", property_price: 550000, score: 83, created_at: "2026-09-01T10:00:00.000Z" },
  { property_id: "p-price", property_price: 500000, score: 80, created_at: "2026-09-01T10:00:00.000Z" },
];

test("keeps only new, materially better or meaningfully repriced homes", () => {
  const result = selectPropertyDeltaCandidates(candidates, history);
  assert.equal(result.historyApplied, true);
  assert.equal(result.historicalProperties, 3);
  assert.equal(result.suppressed, 1);
  assert.deepEqual(result.candidates.map((item) => [item.id, item.deltaReason]), [
    ["p-new", "NEW"],
    ["p-better", "SCORE_IMPROVED"],
    ["p-price", "PRICE_CHANGED"],
  ]);
  assert.equal(result.candidates.find((item) => item.id === "p-better")?.deltaScoreGain, 7);
  assert.equal(result.candidates.find((item) => item.id === "p-price")?.deltaPriceChange, -25000);
});

test("uses the strongest historical score so a previously stronger property is not resurfaced", () => {
  const result = selectPropertyDeltaCandidates(
    [{ id: "p1", price: 500000, baseScore: 88 }],
    [
      { property_id: "p1", property_price: 500000, score: 90, created_at: "2026-08-01T10:00:00.000Z" },
      { property_id: "p1", property_price: 500000, score: 80, created_at: "2026-09-01T10:00:00.000Z" },
    ],
  );
  assert.equal(result.candidates.length, 0);
  assert.equal(result.suppressed, 1);
});

test("uses latest reviewed price and ignores tiny price noise", () => {
  const result = selectPropertyDeltaCandidates(
    [{ id: "p1", price: 498000, baseScore: 80 }],
    [
      { property_id: "p1", property_price: 520000, score: 80, created_at: "2026-08-01T10:00:00.000Z" },
      { property_id: "p1", property_price: 500000, score: 80, created_at: "2026-09-01T10:00:00.000Z" },
    ],
  );
  assert.equal(result.candidates.length, 0);
  assert.equal(result.suppressed, 1);
});

test("without approved shortlist history all current matches remain eligible", () => {
  const result = selectPropertyDeltaCandidates(candidates, []);
  assert.equal(result.historyApplied, false);
  assert.equal(result.suppressed, 0);
  assert.equal(result.candidates.length, candidates.length);
  assert.ok(result.candidates.every((item) => item.deltaReason === "NEW"));
});
