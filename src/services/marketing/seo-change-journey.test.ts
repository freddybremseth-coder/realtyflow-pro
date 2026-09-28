import assert from "node:assert/strict";
import test from "node:test";
import { buildSEOChangeJourneys } from "@/services/marketing/seo-change-journey";

const snapshot = {
  brandId: "pinosoecolife",
  connected: true as const,
  property: "sc-domain:pinosoecolife.com",
  collectedAt: "2026-11-10T08:00:00Z",
  period: {
    currentStart: "2026-10-01",
    currentEnd: "2026-11-05",
    previousStart: "2026-08-20",
    previousEnd: "2026-09-19",
  },
  metric: "Google Search Console web Search Analytics; grouped by canonical page" as const,
  totals: {
    currentClicks: 80,
    currentImpressions: 4000,
    previousClicks: 55,
    previousImpressions: 3200,
    currentCtr: 0.02,
    previousCtr: 0.017,
  },
  topPages: [],
  topQueryPages: [{
    query: "pinoso property",
    page: "/",
    clicks: 32,
    impressions: 1200,
    ctr: 32 / 1200,
    position: 7.4,
  }],
  dataQuality: {
    truncated: false,
    queryRowsSampled: false,
    note: "complete",
  },
};

test("joins a verified SEO change to measured GSC effect and same-page Topic Journey", () => {
  const journeys = buildSEOChangeJourneys({
    changes: [{
      created_at: "2026-09-01T09:00:00Z",
      details: {
        change_id: "pinosoecolife_homepage_v1",
        brand_id: "pinosoecolife",
        page: "/",
        query: "pinoso property",
        applied_at: "2026-09-01T09:00:00Z",
        commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        baseline_period_start: "2026-07-01",
        baseline_period_end: "2026-07-31",
        baseline_impressions: 900,
        baseline_clicks: 18,
        baseline_position: 9.5,
        site_verified: true,
        publisher: "github_metadata_v1",
      },
    }],
    snapshots: [snapshot],
    topicJourneys: [{
      topicId: "seo:pinosoecolife:gsc-content:home",
      genomeTopic: "seo_pinosoecolife_abcdef123456",
      brandId: "pinosoecolife",
      title: "Pinoso property guide",
      canonicalUrl: "https://pinosoecolife.com/",
      sourceStatus: "drafted",
      priority: 90,
      recommendedChannels: ["facebook"],
      evidence: "GSC",
      observation: "Measured opportunity",
      nextAction: null,
      sourceUpdatedAt: "2026-10-01T00:00:00Z",
      sourceLastPlannedAt: "2026-10-01T00:00:00Z",
      stage: "QUALIFIED_SIGNAL",
      contentCount: 1,
      publishedCount: 1,
      measuredContentCount: 1,
      latestPublishedAt: "2026-10-02T00:00:00Z",
      latestMetricsAt: "2026-10-04T00:00:00Z",
      channels: ["facebook"],
      metrics: {
        impressions: 2400,
        views: 0,
        clicks: 28,
        reactions: 20,
        comments: 4,
        saves: 3,
        shares: 2,
      },
      business: {
        leads: 3,
        qualified: 1,
        viewings: 0,
        offers: 0,
        sales: 0,
        commissionEur: 0,
      },
    }],
  });

  assert.equal(journeys.length, 1);
  const row = journeys[0];
  assert.equal(row.measurementStatus, "measured");
  assert.equal(row.baseline.ctrPct, 2);
  assert.equal(row.current?.ctrPct, 2.67);
  assert.equal(row.observedDelta?.impressions, 300);
  assert.equal(row.observedDelta?.clicks, 14);
  assert.equal(row.observedDelta?.ctrPoints, 0.67);
  assert.equal(row.observedDelta?.position, -2.1);
  assert.equal(row.samePageTopics.length, 1);
  assert.equal(row.samePageTopics[0].leads, 3);
  assert.equal(row.samePageTopics[0].qualified, 1);
});

test("does not invent an effect before a complete post-change GSC period", () => {
  const waitingSnapshot = {
    ...snapshot,
    period: {
      ...snapshot.period,
      currentStart: "2026-08-25",
      currentEnd: "2026-09-20",
    },
  };
  const journeys = buildSEOChangeJourneys({
    changes: [{
      details: {
        change_id: "pinosoecolife_homepage_v1",
        brand_id: "pinosoecolife",
        page: "/",
        query: "pinoso property",
        applied_at: "2026-09-01T09:00:00Z",
        commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        baseline_period_start: "2026-07-01",
        baseline_period_end: "2026-07-31",
        baseline_impressions: 900,
        baseline_clicks: 18,
        baseline_position: 9.5,
        site_verified: true,
      },
    }],
    snapshots: [waitingSnapshot],
    topicJourneys: [],
  });

  assert.equal(journeys[0].measurementStatus, "waiting");
  assert.equal(journeys[0].current, null);
  assert.equal(journeys[0].observedDelta, null);
});
