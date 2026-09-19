import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTrackedSEOChanges, parseTrackedSEOChange } from "./seo-change-monitor";
import type { GSCBrandSnapshot } from "./seo-search-console";

const change = parseTrackedSEOChange({
  change_id: "freddyb-es-home-snippet-20260919", brand_id: "freddyb",
  page: "/es/", query: "freddy inmobiliaria",
  commit_sha: "fed04a361e54331654998077722c6fa3e72d99a7",
  applied_at: "2026-09-19T12:48:51Z",
  baseline_period_start: "2026-08-18", baseline_period_end: "2026-09-16",
  baseline_impressions: 33, baseline_clicks: 1, baseline_position: 7.7273,
});
if (!change) throw new Error("Valid tracked pilot SEO change was rejected");

const snapshot = (start: string, end: string, rows: GSCBrandSnapshot["topQueryPages"] = []): GSCBrandSnapshot => ({
  brandId: "freddyb", connected: true, property: "sc-domain:freddybremseth.com",
  collectedAt: "2026-10-26T00:00:00Z",
  period: { currentStart: start, currentEnd: end, previousStart: "2026-08-18", previousEnd: "2026-09-16" },
  metric: "Google Search Console web Search Analytics; grouped by canonical page",
  totals: { currentClicks: 2, currentImpressions: 70, previousClicks: 1,
    previousImpressions: 33, currentCtr: 0.028, previousCtr: 0.03 },
  topPages: [], topQueryPages: rows,
  dataQuality: { truncated: false, queryRowsSampled: true, note: "Sampled top query/pages" },
});

test("Rejects untrusted or unsupported change log before tracking", () => {
  assert.equal(parseTrackedSEOChange({ brand_id: "zeneco", page: "//outside", query: "a" }), null);
  assert.equal(parseTrackedSEOChange({
    change_id: "foo", brand_id: "foreign", page: "/", query: "a",
    commit_sha: "fed04a361e54331654998077722c6fa3e72d99a7",
    applied_at: "2026-09-19T12:48:51Z", baseline_period_start: "2026-08-18",
    baseline_period_end: "2026-09-16", baseline_impressions: 33, baseline_clicks: 1,
    baseline_position: 7,
  }), null);
});

test("Never compares Google data spanning deployment with a clean post-change month", () => {
  assert.equal(evaluateTrackedSEOChanges([change], [snapshot("2026-09-16", "2026-10-15")])[0].status, "waiting");
  assert.equal(evaluateTrackedSEOChanges([change], [snapshot("2026-09-20", "2026-10-18")])[0].status, "waiting");
});

test("Only the exact brand, page and query may be compared", () => {
  const row = { query: "freddy inmobiliaria", page: "/es/", clicks: 3,
    impressions: 66, ctr: 3/66, position: 6.2 };
  assert.equal(evaluateTrackedSEOChanges([change], [snapshot("2026-09-20", "2026-10-20",
    [{ ...row, page: "/en/" }])])[0].status, "incomplete");
  assert.equal(evaluateTrackedSEOChanges([change], [snapshot("2026-09-20", "2026-10-20",
    [{ ...row, query: "freddy homes" }])])[0].status, "incomplete");
  const result = evaluateTrackedSEOChanges([change], [snapshot("2026-09-20", "2026-10-20", [row])])[0];
  assert.equal(result.status, "measured");
  assert.deepEqual(result.current, { start: "2026-09-20", end: "2026-10-20",
    impressions: 66, clicks: 3, position: 6.2 });
  assert.deepEqual(result.baseline, change.baseline);
});

test("Missing, unmeasured or truncated Google data does not produce a false zero or rollback", () => {
  assert.equal(evaluateTrackedSEOChanges([change], [])[0].status, "unavailable");
  assert.equal(evaluateTrackedSEOChanges([change], [snapshot("2026-09-20", "2026-10-20")])[0].status, "incomplete");
  const truncated = snapshot("2026-09-20", "2026-10-20", [{
    page: "/es/", query: "freddy inmobiliaria", clicks: 0,
    impressions: 0, ctr: 0, position: 0,
  }]);
  truncated.dataQuality.truncated = true;
  assert.equal(evaluateTrackedSEOChanges([change], [truncated])[0].status, "incomplete");
});

test("Confirmed Zen metadata revision is tracked without inventing a Git commit", () => {
  const zen = parseTrackedSEOChange({
    change_id: "zeneco_bolig_i_spania_20260916", brand_id: "zeneco",
    page: "/bolig-i-spania", query: "bolig i spania", metadata_revision: 1,
    site_verified: true, applied_at: "2026-09-19T13:00:00Z",
    baseline_period_start: "2026-08-18", baseline_period_end: "2026-09-16",
    baseline_impressions: 50, baseline_clicks: 0, baseline_position: 7,
  });
  assert.equal(zen?.commitSha, null);
  assert.equal(zen?.metadataRevision, 1);
  assert.equal(parseTrackedSEOChange({
    change_id: "zeneco_bolig_i_spania_20260916", brand_id: "zeneco",
    page: "/bolig-i-spania", query: "bolig i spania", metadata_revision: 1,
    site_verified: false, applied_at: "2026-09-19T13:00:00Z",
    baseline_period_start: "2026-08-18", baseline_period_end: "2026-09-16",
    baseline_impressions: 50, baseline_clicks: 0, baseline_position: 7,
  }), null);
});
