import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMarketingPlan } from '@/lib/marketing/autonomous';
import type { DirectorInput } from '@/lib/marketing/autonomous';
import type { GenomeRecommendation } from '@/lib/marketing/learning';

const input: DirectorInput = {
  brandId: 'zeneco',
  brandName: 'Zen Eco Homes',
  goals: [{ kind: 'qualified_leads', target: 10, horizonDays: 30 }],
  pipelineGaps: [],
  inventoryFocus: ['Finestrat'],
  activeCampaignIds: [],
  channels: ['instagram'],
  budget: { contentBudgetEur: 0, productionBudgetEur: 0, paidMediaBudgetEur: 0, experimentBudgetEur: 0 },
  publishingCapacityPerWeek: 10,
};

function plan(recommendation: GenomeRecommendation) {
  return buildMarketingPlan(input, { marketingRunId: 'mr-test', correlationId: 'rf-test', recommendation });
}

test('observational promising evidence stays visible but cannot bias exploit', () => {
  const result = plan({
    favor: { ctaType: { value: 'book_viewing', lift: 1.6, evidence: 'promising' } },
    avoid: [],
    notes: [],
  });
  assert.equal(result.favoredDimensions.ctaType, undefined);
  assert.ok(result.notes.some((note) => note.includes('observer ctaType=book_viewing')));
  assert.deepEqual(result.production, { exploit: 7, adjacent: 2, experiment: 1 });
});

test('reliable observational evidence can bias exploit while exploration remains reserved', () => {
  const result = plan({
    favor: { hookType: { value: 'price_first', lift: 1.5, evidence: 'reliable' } },
    avoid: [],
    notes: [],
  });
  assert.equal(result.favoredDimensions.hookType, 'price_first');
  assert.deepEqual(result.production, { exploit: 7, adjacent: 2, experiment: 1 });
});

test('experiment-backed promising evidence may bias exploit but directional may not', () => {
  const accepted = plan({
    favor: { format: { value: 'reel', lift: 1.4, evidence: 'promising', experimentBacked: true } },
    avoid: [],
    notes: [],
  });
  assert.equal(accepted.favoredDimensions.format, 'reel');

  const rejected = plan({
    favor: { format: { value: 'carousel', lift: 1.8, evidence: 'directional', experimentBacked: true } },
    avoid: [],
    notes: [],
  });
  assert.equal(rejected.favoredDimensions.format, undefined);
});
