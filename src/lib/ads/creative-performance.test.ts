import assert from "node:assert/strict";
import test from "node:test";
import {
  addCreativeTouch,
  compareCreativeOutcomeSignal,
  creativeEvidence,
  creativeRates,
  emptyCreativeMetrics,
} from "./creative-performance";

test("creative funnel metrics count canonical touch types", () => {
  const metrics = emptyCreativeMetrics();
  addCreativeTouch(metrics, { touch_type: "impression" });
  addCreativeTouch(metrics, { touch_type: "click" });
  addCreativeTouch(metrics, { touch_type: "lead_created" });
  addCreativeTouch(metrics, { touch_type: "qualified" });
  addCreativeTouch(metrics, { touch_type: "sale", commission_eur: 1200 });
  assert.equal(metrics.impressions, 1);
  assert.equal(metrics.clicks, 1);
  assert.equal(metrics.leads, 1);
  assert.equal(metrics.qualified, 1);
  assert.equal(metrics.sales, 1);
  assert.equal(metrics.commissionEur, 1200);
});

test("evidence remains conservative for tiny samples", () => {
  const tiny = emptyCreativeMetrics();
  tiny.clicks = 4;
  tiny.leads = 1;
  assert.equal(creativeEvidence(tiny), "none");

  const limited = emptyCreativeMetrics();
  limited.clicks = 60;
  limited.leads = 3;
  assert.equal(creativeEvidence(limited), "limited");

  const moderate = emptyCreativeMetrics();
  moderate.leads = 12;
  assert.equal(creativeEvidence(moderate), "moderate");

  const strong = emptyCreativeMetrics();
  strong.sales = 2;
  assert.equal(creativeEvidence(strong), "strong");
});

test("rates are null when denominator is missing", () => {
  const rates = creativeRates(emptyCreativeMetrics());
  assert.equal(rates.ctrPct, null);
  assert.equal(rates.clickToLeadPct, null);
});

test("outcome sorting prioritizes downstream business outcomes", () => {
  const leadHeavy = emptyCreativeMetrics();
  leadHeavy.leads = 20;
  const sale = emptyCreativeMetrics();
  sale.sales = 1;
  assert.ok(compareCreativeOutcomeSignal(sale, leadHeavy) < 0);
});
