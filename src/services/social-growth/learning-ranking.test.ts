import assert from 'node:assert/strict';
import test from 'node:test';

import { rankFeatureInsights } from './learning-ranking';
import type { FeatureInsight, PostPerformance } from './performance-engine';

function post(id: string, reach: number, signals = 0): PostPerformance {
  return {
    id, brand: 'zeneco', title: id, platform: 'instagram', publishedAt: '2026-08-25T18:00:00Z',
    views: reach, reach, impressions: reach, likes: 1, comments: 0,
    shares: signals > 0 ? 1 : 0, saves: signals > 1 ? 1 : 0,
    interactions: 1 + Math.min(signals, 2), leads: signals > 2 ? 1 : 0,
    engagementRate: reach > 0 ? 1 / reach : null, shareRate: null, saveRate: null, leadRate: null,
    score: 20, confidence: reach >= 1000 ? 'high' : reach >= 200 ? 'medium' : 'low',
    comparisonWindow: '24h', features: { hook_type: 'question' },
  };
}

const insight: FeatureInsight = {
  dimension: 'hook_type', value: 'question', sampleSize: 9, averageScore: 20, liftPercent: 35, confidence: 'reliable',
};

test('many tiny-reach posts stay observe even if legacy insight says reliable', () => {
  const ranked = rankFeatureInsights([insight], Array.from({ length: 9 }, (_, i) => post(String(i), 3)))[0];
  assert.equal(ranked.status, 'observe');
  assert.equal(ranked.autopilotEligible, false);
});

test('moderate aggregate audience becomes directional but not autopilot eligible', () => {
  const ranked = rankFeatureInsights([insight], Array.from({ length: 5 }, (_, i) => post(String(i), 100)))[0];
  assert.equal(ranked.status, 'directional');
  assert.equal(ranked.autopilotEligible, false);
});

test('promote requires scale, repeated meaningful signals and positive lift', () => {
  const posts = Array.from({ length: 8 }, (_, i) => post(String(i), 400, i < 5 ? 3 : 0));
  const ranked = rankFeatureInsights([insight], posts)[0];
  assert.equal(ranked.status, 'promote');
  assert.equal(ranked.autopilotEligible, true);
  assert.ok(ranked.meaningfulSignals >= 5);
  assert.ok(ranked.audience >= 2500);
});
