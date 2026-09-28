import assert from "node:assert/strict";
import test from "node:test";
import { buildSEOTopicJourneys } from "@/services/marketing/seo-topic-journey";

test("builds one SAM topic journey and uses only latest eligible metrics per content", () => {
  const journeys = buildSEOTopicJourneys({
    sources: [{
      brand_id: "zeneco",
      source_id: "gsc-content:test",
      source_url: "https://www.zenecohomes.com/altea",
      title: "Altea villas",
      priority: 90,
      recommended_channels: ["facebook"],
      status: "drafted",
      updated_at: "2026-09-28T12:00:00Z",
      payload: {
        topic_id: "seo:zeneco:gsc-content:test",
        genome_topic: "seo_zeneco_123456789abc",
        canonical_url: "https://www.zenecohomes.com/altea",
        evidence: "GSC",
        observation: "Measured opportunity",
      },
    }],
    contents: [{
      content_id: "content-1",
      brand_id: "zeneco",
      channel: "facebook",
      genome: { topic: "seo_zeneco_123456789abc" },
    }],
    publications: [{
      content_id: "content-1",
      brand_id: "zeneco",
      channel: "facebook",
      state: "published",
      updated_at: "2026-09-28T13:00:00Z",
    }],
    events: [
      {
        content_id: "content-1",
        brand_id: "zeneco",
        channel: "facebook",
        occurred_at: "2026-09-28T14:00:00Z",
        metrics: { impressions: 100, clicks: 2 },
        metadata: { learning_eligible: true },
      },
      {
        content_id: "content-1",
        brand_id: "zeneco",
        channel: "facebook",
        occurred_at: "2026-09-28T16:00:00Z",
        metrics: { impressions: 150, clicks: 4 },
        metadata: { learning_eligible: true },
      },
      {
        content_id: "content-1",
        brand_id: "zeneco",
        channel: "facebook",
        occurred_at: "2026-09-28T17:00:00Z",
        metrics: { impressions: 9999, clicks: 999 },
        metadata: { learning_eligible: false },
      },
    ],
    touchpoints: [
      {
        id: "t1",
        content_id: "content-1",
        brand_id: "zeneco",
        channel: "facebook",
        contact_id: "lead-1",
        touch_type: "lead_created",
      },
      {
        id: "t2",
        content_id: "content-1",
        brand_id: "zeneco",
        channel: "facebook",
        contact_id: "lead-1",
        touch_type: "qualified",
      },
      {
        id: "t3",
        content_id: "content-1",
        brand_id: "zeneco",
        channel: "facebook",
        contact_id: "lead-1",
        touch_type: "sale",
        commission_eur: 12000,
      },
    ],
  });

  assert.equal(journeys.length, 1);
  const journey = journeys[0];
  assert.equal(journey.stage, "BUSINESS_PROVEN");
  assert.equal(journey.metrics.impressions, 150);
  assert.equal(journey.metrics.clicks, 4);
  assert.equal(journey.business.leads, 1);
  assert.equal(journey.business.qualified, 1);
  assert.equal(journey.business.sales, 1);
  assert.equal(journey.business.commissionEur, 12000);
  assert.deepEqual(journey.channels, ["facebook"]);
});

test("keeps an unproduced current SAM mission visible as MISSION_READY", () => {
  const journeys = buildSEOTopicJourneys({
    sources: [{
      brand_id: "pinosoecolife",
      source_id: "gsc-snippet:test",
      source_url: "https://pinosoecolife.com/pinoso",
      title: "Pinoso land",
      priority: 70,
      recommended_channels: ["facebook"],
      status: "ready",
      payload: {
        topic_id: "seo:pinosoecolife:gsc-snippet:test",
        genome_topic: "seo_pinosoecolife_abcdef123456",
        canonical_url: "https://pinosoecolife.com/pinoso",
      },
    }],
    contents: [],
    publications: [],
    events: [],
    touchpoints: [],
  });

  assert.equal(journeys[0].stage, "MISSION_READY");
  assert.equal(journeys[0].publishedCount, 0);
  assert.equal(journeys[0].measuredContentCount, 0);
});
