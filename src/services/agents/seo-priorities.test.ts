import test from "node:test";
import assert from "node:assert/strict";
import { planGSCOpportunities } from "./seo-priorities";
import type { GSCBrandSnapshot } from "./seo-search-console";

function snapshot(overrides: Partial<GSCBrandSnapshot> = {}): GSCBrandSnapshot {
  return {
    brandId: "zeneco", connected: true, property: "sc-domain:zenecohomes.com",
    collectedAt: "2026-09-19T00:00:00Z",
    period: { currentStart: "2026-08-18", currentEnd: "2026-09-16",
      previousStart: "2026-07-19", previousEnd: "2026-08-17" },
    metric: "Google Search Console web Search Analytics; grouped by canonical page",
    totals: { currentClicks: 12, currentImpressions: 200,
      previousClicks: 10, previousImpressions: 210,
      currentCtr: 0.06, previousCtr: 0.0476 },
    topPages: [], topQueryPages: [], dataQuality: {
      truncated: false, queryRowsSampled: true, note: "Only measured page results",
    }, ...overrides,
  };
}
test("Sam does not invent GSC opportunities without measured visibility", () => {
  assert.deepEqual(planGSCOpportunities([snapshot({ totals: {
    currentClicks: 0, currentImpressions: 0, previousClicks: 0,
    previousImpressions: 0, currentCtr: null, previousCtr: null,
  } })]).map(item => item.issueId), ["gsc-zero-visibility:zeneco"]);
});
test("GSC review remains an evidence-backed proposal scoped to brand and period", () => {
  const items = planGSCOpportunities([snapshot({
    topQueryPages: [{
      query: "nybygg costa blanca", page: "/boliger", clicks: 1, impressions: 100,
      ctr: 0.01, position: 9,
    }],
  })]);
  assert.equal(items.length, 1);
  assert.match(items[0].issueId, /^gsc-snippet:zeneco:/);
  assert.match(items[0].evidence, /2026-08-18/);
  assert.match(items[0].description, /100 visninger/);
  assert.match(items[0].nextAction, /Foreslå én faktabasert endring/);
});
test("Truncated Google page data must be reviewed before any growth calculations", () => {
  const items = planGSCOpportunities([snapshot({
    dataQuality: { truncated: true, queryRowsSampled: true, note: "capped" },
    topQueryPages: [{ query: "foo", page: "/", impressions: 100, clicks: 0, ctr: 0, position: 10 }],
  })]);
  assert.deepEqual(items.map(item => item.issueId), ["gsc-pagination:zeneco"]);
});
test("No diagnosis from small or unverified data patterns", () => {
  const items = planGSCOpportunities([snapshot({
    totals: { currentClicks: 1, currentImpressions: 50, previousClicks: 5,
      previousImpressions: 80, currentCtr: 0.02, previousCtr: 0.0625 },
    topQueryPages: [{ query: "test", page: "/", impressions: 20, clicks: 0, ctr: 0, position: 4 }],
  })]);
  assert.equal(items.length, 0);
});
