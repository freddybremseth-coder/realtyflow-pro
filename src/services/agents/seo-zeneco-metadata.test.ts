import test from "node:test";
import assert from "node:assert/strict";
import {
  ZENECO_METADATA_VARIANTS, selectZenEcoMetadataCandidate, zenEcoReadinessValid,
} from "./seo-zeneco-metadata";
import type { GSCBrandSnapshot } from "./seo-search-console";

function snapshot(overrides: Partial<GSCBrandSnapshot> = {}): GSCBrandSnapshot {
  return {
    brandId: "zeneco", connected: true, property: "https://www.zenecohomes.com/",
    collectedAt: "2026-09-19T11:50:00Z",
    period: { currentStart: "2026-08-18", currentEnd: "2026-09-16",
      previousStart: "2026-07-19", previousEnd: "2026-08-17" },
    metric: "Google Search Console web Search Analytics; grouped by canonical page",
    totals: { currentClicks: 2, currentImpressions: 140, previousClicks: 0,
      previousImpressions: 0, currentCtr: 0.014, previousCtr: null },
    topPages: [{ path: "/bolig-i-spania", clicks: 2, impressions: 120, ctr: 2/120, position: 9 }],
    topQueryPages: [{ page: "/bolig-i-spania", query: "bolig i spania",
      clicks: 0, impressions: 50, ctr: 0, position: 7 }],
    dataQuality: { truncated: false, queryRowsSampled: true, note: "full" },
    ...overrides,
  };
}
const now = new Date("2026-09-19T12:00:00Z");

test("Only four literal existing Zen pages with short factual metadata are eligible", () => {
  assert.equal(ZENECO_METADATA_VARIANTS.length, 4);
  for (const v of ZENECO_METADATA_VARIANTS) {
    assert.match(v.path, /^\/[a-z0-9-]+$/);
    assert.equal(v.title.length >= 22 && v.title.length <= 65, true);
    assert.equal(v.description.length >= 70 && v.description.length <= 160, true);
    assert.equal(/[<>]/.test(v.title + v.description), false);
  }
});

test("Only a fresh exact-brand and exact-property Google query may select one fixed variant", () => {
  const candidate = selectZenEcoMetadataCandidate(snapshot(), now);
  assert.equal(candidate?.path, "/bolig-i-spania");
  assert.equal(candidate?.query, "bolig i spania");
  assert.equal(candidate?.baseline.impressions, 50);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ brandId: "freddyb" }), now), null);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ property: "sc-domain:chatgenius.pro" }), now), null);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ collectedAt: "2026-08-01T00:00:00Z" }), now), null);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ topQueryPages: [] }), now), null);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ topQueryPages: [
    { page: "/es/", query: "bolig i spania", clicks: 0, impressions: 100, ctr: 0, position: 7 },
  ] }), now), null);
});

test("Traffic alone, sparse results, truncated reads, and zero visibility never cause publication", () => {
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ totals: {
    currentClicks: 0, currentImpressions: 0, previousClicks: 0,
    previousImpressions: 0, currentCtr: null, previousCtr: null,
  } }), now), null);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ dataQuality: {
    truncated: true, queryRowsSampled: true, note: "incomplete",
  } }), now), null);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ topPages: [
    { path: "/bolig-i-spania", clicks: 0, impressions: 40, ctr: 0, position: 9 },
  ] }), now), null);
  assert.equal(selectZenEcoMetadataCandidate(snapshot({ topQueryPages: [
    { page: "/bolig-i-spania", query: "bolig i spania", clicks: 0,
      impressions: 39, ctr: 0, position: 7 },
  ] }), now), null);
});

test("Publisher capability requires exact verified service, readable RLS and same Supabase project", () => {
  const ready = { service: "zeneco-metadata-v1", databaseReadable: true,
    dbHost: "correct.supabase.co" };
  assert.equal(zenEcoReadinessValid(ready, "correct.supabase.co"), true);
  assert.equal(zenEcoReadinessValid({ ...ready, dbHost: "other.supabase.co" },
    "correct.supabase.co"), false);
  assert.equal(zenEcoReadinessValid({ ...ready, databaseReadable: false },
    "correct.supabase.co"), false);
  assert.equal(zenEcoReadinessValid({ ...ready, service: "unknown" },
    "correct.supabase.co"), false);
});

test("previously changed or rolled-back first page does not starve another eligible page", () => {
  const input = snapshot();
  input.topPages.push({ ...input.topPages[0], path: "/nybygg-i-spania" });
  input.topQueryPages.push({ ...input.topQueryPages[0], page: "/nybygg-i-spania", query: "nybygg i spania" });
  assert.equal(selectZenEcoMetadataCandidate(input, now, new Set(["/bolig-i-spania"]))?.path, "/nybygg-i-spania");
  assert.equal(selectZenEcoMetadataCandidate(input, now, new Set(["/bolig-i-spania", "/nybygg-i-spania"])), null);
});
