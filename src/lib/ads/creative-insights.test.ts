import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCreativeDimension } from "./creative-insights";
import { emptyCreativeMetrics } from "./creative-performance";

function metrics(overrides: Partial<ReturnType<typeof emptyCreativeMetrics>> = {}) {
  return { ...emptyCreativeMetrics(), ...overrides };
}

test("small hook samples remain observe", () => {
  const rows = aggregateCreativeDimension([
    { dimensionValue: "aspiration", metrics: metrics({ leads: 1, clicks: 10 }) },
    { dimensionValue: "aspiration", metrics: metrics({ leads: 1, clicks: 12 }) },
  ]);
  assert.equal(rows[0].value, "aspiration");
  assert.equal(rows[0].status, "observe");
  assert.equal(rows[0].evidence, "none");
});

test("moderate downstream evidence promotes a pattern but does not call it a winner", () => {
  const rows = aggregateCreativeDimension([
    { dimensionValue: "specificity", metrics: metrics({ leads: 6, qualified: 3 }) },
    { dimensionValue: "specificity", metrics: metrics({ leads: 6, qualified: 2 }) },
  ]);
  assert.equal(rows[0].status, "promising");
  assert.equal(rows[0].evidence, "moderate");
  assert.equal(rows[0].metrics.leads, 12);
});

test("economics only aggregate when every row is comparable in one currency", () => {
  const good = aggregateCreativeDimension([
    { dimensionValue: "offer", metrics: metrics({ leads: 2, qualified: 1 }), economics: { state: "comparable", comparableRawSpend: 20, singleCurrency: "EUR", spendEur: 20 } },
    { dimensionValue: "offer", metrics: metrics({ leads: 2, qualified: 1 }), economics: { state: "comparable", comparableRawSpend: 30, singleCurrency: "EUR", spendEur: 30 } },
  ])[0];
  assert.equal(good.economics.comparable, true);
  assert.equal(good.economics.spend, 50);
  assert.equal(good.economics.cpl, 12.5);

  const mixed = aggregateCreativeDimension([
    { dimensionValue: "offer", metrics: metrics({ leads: 1 }), economics: { state: "comparable", comparableRawSpend: 10, singleCurrency: "EUR", spendEur: 10 } },
    { dimensionValue: "offer", metrics: metrics({ leads: 1 }), economics: { state: "comparable", comparableRawSpend: 10, singleCurrency: "USD", spendEur: null } },
  ])[0];
  assert.equal(mixed.economics.comparable, false);
  assert.equal(mixed.economics.spend, null);
});
