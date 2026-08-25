import type { FeatureInsight, PostPerformance } from './performance-engine';

export type LearningStatus = 'observe' | 'directional' | 'reliable' | 'promote';

export type RankedFeatureInsight = FeatureInsight & {
  audience: number;
  meaningfulSignals: number;
  status: LearningStatus;
  autopilotEligible: boolean;
};

function audience(post: PostPerformance) {
  return Math.max(post.reach || 0, post.impressions || 0, post.views || 0);
}

function meaningfulSignals(post: PostPerformance) {
  return (post.shares || 0) + (post.saves || 0) + (post.leads || 0);
}

export function rankFeatureInsights(
  insights: FeatureInsight[],
  posts: PostPerformance[],
): RankedFeatureInsight[] {
  return insights.map((insight) => {
    const matching = posts.filter((post) => String(post.features[insight.dimension] || 'unspecified') === insight.value);
    const totalAudience = matching.reduce((sum, post) => sum + audience(post), 0);
    const signals = matching.reduce((sum, post) => sum + meaningfulSignals(post), 0);

    let status: LearningStatus = 'observe';
    if (matching.length >= 3 && totalAudience >= 200) status = 'directional';
    if (matching.length >= 5 && totalAudience >= 1000 && signals >= 2) status = 'reliable';
    if (matching.length >= 8 && totalAudience >= 2500 && signals >= 5 && insight.liftPercent >= 15) status = 'promote';

    return {
      ...insight,
      audience: totalAudience,
      meaningfulSignals: signals,
      status,
      autopilotEligible: status === 'promote',
    };
  }).sort((a, b) => {
    const order: Record<LearningStatus, number> = { promote: 4, reliable: 3, directional: 2, observe: 1 };
    return order[b.status] - order[a.status] || b.liftPercent - a.liftPercent || b.audience - a.audience;
  });
}
