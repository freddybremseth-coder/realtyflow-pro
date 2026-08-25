import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFeatureInsights, buildGrowthRecommendations, buildTrackingUrl, calculatePostPerformance, classifyContentFeatures, latestSnapshots } from './performance-engine';

test('uses only the latest snapshot per publication and platform', () => {
  const latest = latestSnapshots([
    { publication_id: 'p1', platform: 'instagram', snapshot_at: '2026-08-01', reach: 10 },
    { publication_id: 'p1', platform: 'instagram', snapshot_at: '2026-08-02', reach: 30 },
  ]);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].reach, 30);
});

test('ranks meaningful engagement and attributes leads by utm_content', () => {
  const result = calculatePostPerformance(
    [{ id: 'p1', brand_id: 'zeneco', title: 'Villa i Finestrat' }],
    [{ publication_id: 'p1', platform: 'instagram', reach: 1000, likes: 30, comments: 4, shares: 12, saves: 18, views: 1500 }],
    [{ id: 'l1', utm_source: 'instagram', utm_content: 'p1' }],
  )[0];
  assert.equal(result.leads, 1);
  assert.equal(result.shareRate, 0.012);
  assert.equal(result.saveRate, 0.018);
  assert.equal(result.confidence, 'high');
  assert.ok(result.score > 0);
  assert.equal(buildGrowthRecommendations([result])[0].action, 'create_variant');
});

test('builds a stable post-level UTM link', () => {
  const url = new URL(buildTrackingUrl('https://zenecohomes.com/contact', { id: 'post-7', brand_id: 'zeneco' }));
  assert.equal(url.searchParams.get('utm_source'), 'instagram');
  assert.equal(url.searchParams.get('utm_content'), 'post-7');
});

test('classifies useful real-estate content features and requires pattern samples', () => {
  const features = classifyContentFeatures({ id: 'x', brand_id: 'soleada', title: '3 feil ved kjøp av villa i Altea', description: 'Skriv ALTEA for visning' });
  assert.equal(features.area, 'altea');
  assert.equal(features.hook_type, 'list');
  assert.equal(features.property_type, 'villa');
  assert.equal(features.goal, 'lead');
  const posts = Array.from({ length: 5 }, (_, index) => ({
    id: String(index), brand: 'soleada', title: 'x', platform: 'instagram', publishedAt: null,
    views: 1000, reach: 1000, impressions: 1000, likes: 0, comments: 0, shares: 0, saves: 0,
    interactions: 0, leads: 0, engagementRate: 0, shareRate: 0, saveRate: 0, leadRate: 0,
    score: index < 3 ? 60 : 20, confidence: 'high' as const,
    comparisonWindow: '7d',
    features: { format: index < 3 ? 'reel' : 'post' },
  }));
  assert.ok(buildFeatureInsights(posts).some((insight) => insight.value === 'reel'));
});

test('autopilot posts expose hook CTA caption price and timing dimensions', () => {
  const features = classifyContentFeatures({
    id: 'p1',
    brand_id: 'zeneco',
    title: 'Villa i Finestrat',
    description: 'Drømmer du om havutsikt? Pris €495.000. Kontakt oss for visning.',
    published_at: '2026-08-24T20:20:00Z',
    content_features: {
      source: 'marketing_publish_executor_backfill',
      genome: { hookType: 'question', ctaType: 'book_viewing', goal: 'lead_generation', format: 'reel' },
    },
  });
  assert.equal(features.source, 'autopilot');
  assert.equal(features.area, 'finestrat');
  assert.equal(features.hook_type, 'question');
  assert.equal(features.cta_type, 'book_viewing');
  assert.equal(features.goal, 'lead_generation');
  assert.equal(features.format, 'reel');
  assert.equal(features.caption_length, 'short');
  assert.equal(features.price_bucket, '400k_750k');
  assert.equal(features.publish_hour_utc, '20');
  assert.equal(features.daypart_utc, 'evening');
});

test('small feature groups stay directional rather than becoming reliable winners', () => {
  const posts = Array.from({ length: 5 }, (_, index) => ({
    id: `p${index}`, brand: 'zeneco', title: 'x', platform: 'instagram', publishedAt: null,
    views: 500, reach: 500, impressions: 500, likes: 5, comments: 0, shares: 1, saves: 1,
    interactions: 7, leads: 0, engagementRate: 0.014, shareRate: 0.002, saveRate: 0.002, leadRate: 0,
    score: 30, confidence: 'medium' as const, comparisonWindow: '24h',
    features: { hook_type: index < 2 ? 'question' : 'price', source: 'autopilot' },
  }));
  const insight = buildFeatureInsights(posts).find((item) => item.dimension === 'hook_type' && item.value === 'question');
  assert.ok(insight);
  assert.equal(insight?.sampleSize, 2);
  assert.equal(insight?.confidence, 'directional');
});
