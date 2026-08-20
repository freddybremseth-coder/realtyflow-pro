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
