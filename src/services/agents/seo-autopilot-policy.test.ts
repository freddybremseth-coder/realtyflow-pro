import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSeoPilotBrand, seoPublicWriteAllowed } from "./seo-autopilot-policy";
import type { GSCBrandSnapshot } from "./seo-search-console";

function snapshot(brandId: string, impressions: number): GSCBrandSnapshot {
  return {
    brandId, connected: true, property: "sc-domain:zenecohomes.com",
    collectedAt: "2026-09-19T10:00:00Z",
    period: { currentStart: "2026-08-18", currentEnd: "2026-09-16",
      previousStart: "2026-07-19", previousEnd: "2026-08-17" },
    metric: "Google Search Console web Search Analytics; grouped by canonical page",
    totals: { currentClicks: 0, currentImpressions: impressions,
      previousClicks: 0, previousImpressions: 0, currentCtr: 0, previousCtr: null },
    topPages: [{ path: "/magasin/guide", clicks: 0, impressions, ctr: 0, position: 8 }],
    topQueryPages: [{ query: "guide", page: "/magasin/guide",
      clicks: 0, impressions: 45, ctr: 0, position: 8 }],
    dataQuality: { truncated: false, queryRowsSampled: true, note: "measured" },
  };
}

test("Zero Google views are monitored without creating an approval or declaring an index failure", () => {
  const result = evaluateSeoPilotBrand("zeneco", snapshot("zeneco", 0));
  assert.equal(result.status, "monitor");
  assert.equal(result.publicChangePermitted, false);
});

test("Only two user-approved brands are in the pilot", () => {
  assert.equal(evaluateSeoPilotBrand("chatgenius", snapshot("chatgenius", 250)).status, "monitor");
  assert.equal(evaluateSeoPilotBrand("freddyb", null).status, "blocked");
});

test("A real query and measured page threshold create investigation, not unverified publication", () => {
  assert.equal(evaluateSeoPilotBrand("zeneco", snapshot("zeneco", 120)).status, "candidate");
  assert.equal(evaluateSeoPilotBrand("zeneco", snapshot("zeneco", 99)).status, "monitor");
  const incomplete = snapshot("zeneco", 130);
  incomplete.dataQuality.truncated = true;
  assert.equal(evaluateSeoPilotBrand("zeneco", incomplete).status, "blocked");
});

test("Only reversible verified small own-site edits can pass execution boundary", () => {
  const safe = { brandId: "zeneco", ownedPageVerified: true, publisherVerified: true,
    reversibleRevisionRecorded: true, sourceMatchedExactly: true,
    hasFactualClaims: false, contentScope: "meta_description" as const };
  assert.equal(seoPublicWriteAllowed(safe), true);
  assert.equal(seoPublicWriteAllowed({ ...safe, brandId: "donaanna" }), false);
  assert.equal(seoPublicWriteAllowed({ ...safe, publisherVerified: false }), false);
  assert.equal(seoPublicWriteAllowed({ ...safe, reversibleRevisionRecorded: false }), false);
  assert.equal(seoPublicWriteAllowed({ ...safe, contentScope: "price" }), false);
  assert.equal(seoPublicWriteAllowed({ ...safe, hasFactualClaims: true }), false);
});
