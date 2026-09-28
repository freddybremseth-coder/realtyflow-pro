import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSEOTopicMissions } from "@/services/marketing/seo-topic-missions";
import type { GSCBrandSnapshot } from "@/services/agents/seo-search-console";

function snapshot(overrides: Partial<GSCBrandSnapshot> = {}): GSCBrandSnapshot {
  return {
    brandId: "zeneco",
    connected: true,
    property: "https://www.zenecohomes.com/",
    collectedAt: "2026-09-28T12:00:00.000Z",
    period: {
      currentStart: "2026-08-27",
      currentEnd: "2026-09-25",
      previousStart: "2026-07-28",
      previousEnd: "2026-08-26",
    },
    metric: "Google Search Console web Search Analytics; grouped by canonical page",
    totals: {
      currentClicks: 8,
      currentImpressions: 500,
      previousClicks: 7,
      previousImpressions: 450,
      currentCtr: 0.016,
      previousCtr: 0.0156,
    },
    topPages: [],
    topQueryPages: [],
    dataQuality: { truncated: false, queryRowsSampled: true, note: "test" },
    ...overrides,
  };
}

test("turns a measured GSC content opportunity into one stable shared topic mission", () => {
  const missions = buildSEOTopicMissions([
    snapshot({
      topQueryPages: [{
        query: "modern villas costa blanca",
        page: "/new-build-villas/",
        clicks: 1,
        impressions: 120,
        ctr: 0.0083,
        position: 11,
      }],
    }),
  ]);

  assert.equal(missions.length, 1);
  const mission = missions[0];
  assert.equal(mission.brandId, "zeneco");
  assert.equal(mission.sourceId, "gsc-snippet:zeneco:%2Fnew-build-villas%2F");
  assert.equal(mission.sourceUrl, "https://www.zenecohomes.com/new-build-villas/");
  assert.deepEqual(mission.recommendedChannels, ["instagram", "facebook"]);
  assert.equal(mission.payload.origin, "sam_seo");
  assert.equal(mission.payload.canonical_url, mission.sourceUrl);
  assert.equal(mission.payload.topic_id, `seo:zeneco:${mission.sourceId}`);
  assert.equal(mission.payload.content_cluster_id, mission.payload.topic_id);
});

test("does not turn portfolio/technical Search Console warnings into social topic missions", () => {
  const missions = buildSEOTopicMissions([
    snapshot({
      totals: {
        currentClicks: 0,
        currentImpressions: 0,
        previousClicks: 0,
        previousImpressions: 0,
        currentCtr: null,
        previousCtr: null,
      },
    }),
  ]);

  assert.deepEqual(missions, []);
});

test("fails closed when a measured page cannot be mapped to an owned brand website", () => {
  const missions = buildSEOTopicMissions([
    snapshot({
      brandId: "unknown-brand",
      topQueryPages: [{
        query: "example",
        page: "/example/",
        clicks: 0,
        impressions: 100,
        ctr: 0,
        position: 10,
      }],
    }),
  ]);

  assert.deepEqual(missions, []);
});
