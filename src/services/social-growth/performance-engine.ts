export type PublicationInput = {
  id: string;
  brand_id: string;
  title?: string | null;
  description?: string | null;
  content_type?: string | null;
  tags?: string[] | null;
  published_at?: string | null;
  created_at?: string | null;
  performance_goal?: string | null;
  content_features?: Record<string, unknown> | null;
  total_views?: number | null;
  total_likes?: number | null;
  total_comments?: number | null;
  total_shares?: number | null;
};

export type SnapshotInput = {
  publication_id: string;
  platform: string;
  snapshot_at?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  impressions?: number | null;
  total_interactions?: number | null;
  metric_window?: string | null;
  raw_data?: Record<string, unknown> | null;
};

export type LeadInput = {
  id?: string;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  source?: string | null;
  status?: string | null;
};

export type PostPerformance = {
  id: string;
  brand: string;
  title: string;
  platform: string;
  publishedAt: string | null;
  views: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  interactions: number;
  leads: number;
  engagementRate: number | null;
  shareRate: number | null;
  saveRate: number | null;
  leadRate: number | null;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  comparisonWindow: string;
  features: Record<string, unknown>;
};

const count = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

const rate = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : null;
const pct = (value: number | null) => value === null ? 0 : value * 100;

function captionLengthBucket(text: string) {
  const length = text.trim().length;
  if (length < 300) return 'short';
  if (length < 800) return 'medium';
  return 'long';
}

function priceBucket(text: string) {
  const matches = Array.from(text.matchAll(/(?:€|eur\s*)\s*([0-9][0-9.\s]*)/gi));
  const raw = matches[0]?.[1];
  if (!raw) return 'unspecified';
  const value = Number(raw.replace(/[.\s]/g, ''));
  if (!Number.isFinite(value) || value <= 0) return 'unspecified';
  if (value < 400000) return 'under_400k';
  if (value < 750000) return '400k_750k';
  if (value < 1500000) return '750k_1_5m';
  return 'over_1_5m';
}

function publishingTimeFeatures(publication: PublicationInput) {
  const timestamp = publication.published_at || publication.created_at;
  if (!timestamp) return { publish_hour_utc: 'unspecified', publish_day_utc: 'unspecified', daypart_utc: 'unspecified' };
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { publish_hour_utc: 'unspecified', publish_day_utc: 'unspecified', daypart_utc: 'unspecified' };
  const hour = date.getUTCHours();
  const daypart = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night';
  return {
    publish_hour_utc: String(hour).padStart(2, '0'),
    publish_day_utc: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getUTCDay()],
    daypart_utc: daypart,
  };
}

export function classifyContentFeatures(publication: PublicationInput) {
  const existing = publication.content_features || {};
  const genome = existing.genome && typeof existing.genome === 'object' ? existing.genome as Record<string, unknown> : {};
  const text = `${publication.title || ''} ${publication.description || ''} ${(publication.tags || []).join(' ')}`.toLowerCase();
  const areas = ['altea', 'albir', 'benidorm', 'finestrat', 'villajoyosa', 'la nucia', 'polop', 'moraira', 'denia', 'pinoso', 'aspe', 'novelda'];
  const area = areas.find((candidate) => text.includes(candidate)) || 'unspecified';
  const format = String(genome.format || '').trim() || (text.includes('reel') || publication.content_type?.includes('video') ? 'reel' :
    text.includes('carousel') || text.includes('karusell') ? 'carousel' : 'post');
  const language = /\b(the|your|villa|property|discover)\b/.test(text) ? 'en' :
    /\b(vivienda|casa|descubre|precio)\b/.test(text) ? 'es' : 'no';
  const hookType = String(genome.hookType || genome.hook_type || '').trim() || (/\b(\d+|tre|fem)\s+(tips|feil|grunner|ting)\b/.test(text) ? 'list' :
    text.includes('?') ? 'question' : /€|eur|pris|price|precio/.test(text) ? 'price' : 'statement');
  const ctaType = String(genome.ctaType || genome.cta_type || '').trim() || (/(book|visning)/.test(text) ? 'book_viewing' : /(send melding|dm|skriv)/.test(text) ? 'message' : /(kontakt|contact)/.test(text) ? 'contact' : 'unspecified');
  const goal = publication.performance_goal || String(genome.goal || '').trim() || (/(kontakt|skriv|send|book|visning|dm)/.test(text) ? 'lead' : 'reach');
  const propertyType = /(tomt|plot|parcel)/.test(text) ? 'plot' : /(leilighet|apartment|apartamento)/.test(text) ? 'apartment' : /(villa|enebolig)/.test(text) ? 'villa' : 'unspecified';
  const source = String(existing.source || '').includes('marketing_publish_executor') ? 'autopilot' : 'legacy_or_manual';
  return {
    area,
    format,
    language,
    hook_type: hookType,
    cta_type: ctaType,
    goal,
    property_type: propertyType,
    caption_length: captionLengthBucket(publication.description || ''),
    price_bucket: priceBucket(text),
    ...publishingTimeFeatures(publication),
    ...existing,
    source,
  };
}

function rawCount(snapshot: SnapshotInput, key: string) {
  return count(snapshot.raw_data?.[key]);
}

export function latestSnapshots(snapshots: SnapshotInput[]) {
  const latest = new Map<string, SnapshotInput>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.publication_id}:${snapshot.platform}`;
    const existing = latest.get(key);
    const timestamp = new Date(snapshot.snapshot_at || 0).getTime();
    const existingTimestamp = new Date(existing?.snapshot_at || 0).getTime();
    if (!existing || timestamp >= existingTimestamp) latest.set(key, snapshot);
  }
  return Array.from(latest.values());
}

function publicationLeads(publicationId: string, leads: LeadInput[]) {
  return leads.filter((lead) =>
    lead.utm_content === publicationId ||
    lead.utm_campaign === publicationId ||
    (lead.source || '').toLowerCase().includes(publicationId.toLowerCase()),
  ).length;
}

export function calculatePostPerformance(
  publications: PublicationInput[],
  snapshots: SnapshotInput[],
  leads: LeadInput[] = [],
): PostPerformance[] {
  const latest = latestSnapshots(snapshots);
  const byPublication = new Map(latest.map((snapshot) => [snapshot.publication_id, snapshot]));

  return publications.map((publication) => {
    const snapshot = byPublication.get(publication.id);
    const reach = count(snapshot?.reach);
    const impressions = count(snapshot?.impressions);
    const views = count(snapshot?.views) || rawCount(snapshot || ({} as SnapshotInput), 'views') || count(publication.total_views);
    const likes = count(snapshot?.likes) || count(publication.total_likes);
    const comments = count(snapshot?.comments) || count(publication.total_comments);
    const shares = count(snapshot?.shares) || count(publication.total_shares);
    const saves = count(snapshot?.saves) || rawCount(snapshot || ({} as SnapshotInput), 'saves');
    const interactions = count(snapshot?.total_interactions) || rawCount(snapshot || ({} as SnapshotInput), 'total_interactions') || likes + comments + shares + saves;
    const leadCount = publicationLeads(publication.id, leads);
    const audience = reach || impressions || views;
    const engagementRate = rate(interactions, audience);
    const shareRate = rate(shares, audience);
    const saveRate = rate(saves, audience);
    const leadRate = rate(leadCount, audience);
    const sample = audience;
    const confidence: PostPerformance['confidence'] = sample >= 1000 ? 'high' : sample >= 200 ? 'medium' : 'low';
    const confidenceFactor = confidence === 'high' ? 1 : confidence === 'medium' ? 0.8 : 0.55;
    const score = Math.round(Math.min(100,
      (pct(engagementRate) * 5 + pct(shareRate) * 14 + pct(saveRate) * 10 + pct(leadRate) * 80) * confidenceFactor,
    ));

    return {
      id: publication.id,
      brand: publication.brand_id,
      title: publication.title || publication.description?.slice(0, 80) || 'Uten tittel',
      platform: snapshot?.platform || 'instagram',
      publishedAt: publication.published_at || publication.created_at || null,
      views, reach, impressions, likes, comments, shares, saves, interactions,
      leads: leadCount, engagementRate, shareRate, saveRate, leadRate, score, confidence,
      comparisonWindow: snapshot?.metric_window || 'lifetime',
      features: classifyContentFeatures(publication),
    };
  }).sort((a, b) => b.score - a.score || b.leads - a.leads || b.interactions - a.interactions);
}

export type FeatureInsight = {
  dimension: string;
  value: string;
  sampleSize: number;
  averageScore: number;
  liftPercent: number;
  confidence: 'directional' | 'reliable';
};

export function buildFeatureInsights(posts: PostPerformance[]): FeatureInsight[] {
  if (posts.length < 5) return [];
  const windowCounts = posts.reduce<Record<string, number>>((counts, post) => {
    counts[post.comparisonWindow] = (counts[post.comparisonWindow] || 0) + 1;
    return counts;
  }, {});
  const comparisonWindow = Object.entries(windowCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'lifetime';
  const comparablePosts = posts.filter((post) => post.comparisonWindow === comparisonWindow);
  if (comparablePosts.length < 5) return [];
  const overall = comparablePosts.reduce((sum, post) => sum + post.score, 0) / comparablePosts.length;
  const dimensions = ['area', 'format', 'language', 'hook_type', 'cta_type', 'goal', 'property_type', 'caption_length', 'price_bucket', 'source', 'publish_day_utc', 'daypart_utc'];
  const groups = new Map<string, PostPerformance[]>();
  for (const post of comparablePosts) {
    for (const dimension of dimensions) {
      const value = String(post.features[dimension] || 'unspecified');
      if (value === 'unspecified') continue;
      const key = `${dimension}:${value}`;
      groups.set(key, [...(groups.get(key) || []), post]);
    }
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length >= 2)
    .map(([key, group]) => {
      const [dimension, value] = key.split(':');
      const averageScore = group.reduce((sum, post) => sum + post.score, 0) / group.length;
      return {
        dimension,
        value,
        sampleSize: group.length,
        averageScore: Math.round(averageScore),
        liftPercent: overall > 0 ? Math.round(((averageScore - overall) / overall) * 100) : 0,
        confidence: group.length >= 5 ? 'reliable' as const : 'directional' as const,
      };
    })
    .sort((a, b) => b.liftPercent - a.liftPercent || b.sampleSize - a.sampleSize)
    .slice(0, 12);
}

export type GrowthRecommendation = {
  id: string;
  priority: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  rationale: string;
  action: 'fix_tracking' | 'create_variant' | 'repeat_format' | 'collect_data';
  publicationId?: string;
};

export function buildGrowthRecommendations(posts: PostPerformance[]): GrowthRecommendation[] {
  if (posts.length === 0) return [{
    id: 'collect-first-data', priority: 'high', action: 'collect_data',
    title: 'Samle de første resultatene',
    description: 'Publiser og spor minst fem Instagram-innlegg før RealtyFlow trekker mønsterkonklusjoner.',
    rationale: 'For få datapunkter gir svake og potensielt misvisende anbefalinger.',
  }];

  const recommendations: GrowthRecommendation[] = [];
  const trackedLeads = posts.reduce((sum, post) => sum + post.leads, 0);
  if (trackedLeads === 0) recommendations.push({
    id: 'fix-lead-attribution', priority: 'critical', action: 'fix_tracking',
    title: 'Aktiver postnivå-sporing av leads',
    description: 'Bruk den unike RealtyFlow-lenken i bio, Story eller annonse for hvert kampanjeinnlegg.',
    rationale: 'Engasjement uten lead-attribusjon kan ikke optimaliseres mot møter og salg.',
  });

  const winner = posts.find((post) => post.confidence !== 'low' && (post.shares > 0 || post.saves > 0 || post.leads > 0));
  if (winner) recommendations.push({
    id: `variant-${winner.id}`, priority: 'high', action: 'create_variant', publicationId: winner.id,
    title: `Lag en vinnende variant av «${winner.title}»`,
    description: 'Behold innholdsmekanismen og CTA-en, men test en ny åpning eller et nytt område.',
    rationale: `Innlegget har score ${winner.score}/100 med ${winner.shares} delinger, ${winner.saves} lagringer og ${winner.leads} attribuerte leads.`,
  });

  if (posts.length < 5) recommendations.push({
    id: 'minimum-sample', priority: 'medium', action: 'collect_data',
    title: 'Bygg et sammenlignbart datagrunnlag',
    description: `Publiser ${5 - posts.length} flere klassifiserte innlegg før format og tidspunkt rangeres.`,
    rationale: 'RealtyFlow krever minst fem innlegg for mønsteranalyse.',
  });
  return recommendations.slice(0, 5);
}

export function buildTrackingUrl(baseUrl: string, publication: Pick<PublicationInput, 'id' | 'brand_id'>) {
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', publication.brand_id);
  url.searchParams.set('utm_content', publication.id);
  return url.toString();
}
