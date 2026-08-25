import { NextRequest, NextResponse } from 'next/server';

import { requireAdminApi } from '@/lib/api-admin';
import { createServerClient } from '@/lib/supabase/server';
import { rankFeatureInsights } from '@/services/social-growth/learning-ranking';
import {
  buildGrowthRecommendations,
  buildFeatureInsights,
  buildTrackingUrl,
  calculatePostPerformance,
  type LeadInput,
  type PublicationInput,
  type SnapshotInput,
} from '@/services/social-growth/performance-engine';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractLead(contact: any): LeadInput {
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const metadata = interactions.map((item: any) => item?.metadata || {}).find((item: any) => item.utm_source || item.utm_content) || {};
  const notes = clean(contact.notes);
  const utmLine = notes.match(/UTM:\s*([^/\n]+)\s*\/\s*([^/\n]+)(?:\s*\/\s*([^\n]+))?/i);
  return {
    id: clean(contact.id),
    source: clean(contact.source),
    status: clean(contact.pipeline_status),
    utm_source: clean(metadata.utm_source) || clean(utmLine?.[1]),
    utm_campaign: clean(metadata.utm_campaign) || clean(utmLine?.[2]),
    utm_content: clean(metadata.utm_content) || clean(utmLine?.[3]),
  };
}

async function loadWorkspace(brandId?: string) {
  const supabase = createServerClient();
  let publicationsQuery = supabase
    .from('content_publications')
    .select('id,brand_id,title,description,content_type,tags,published_at,created_at,total_views,total_likes,total_comments,total_shares,performance_goal,content_features,tracking_url')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (brandId) publicationsQuery = publicationsQuery.eq('brand_id', brandId);

  const [publicationRes, snapshotRes, contactRes, experimentRes] = await Promise.all([
    publicationsQuery,
    supabase.from('engagement_snapshots').select('publication_id,platform,snapshot_at,metric_window,views,likes,comments,shares,saves,reach,impressions,total_interactions,raw_data').order('snapshot_at', { ascending: false }).limit(2000),
    supabase.from('contacts').select('id,source,notes,interactions,pipeline_status').order('created_at', { ascending: false }).limit(1000),
    supabase.from('social_growth_experiments').select('*').order('created_at', { ascending: false }).limit(50),
  ]);

  if (publicationRes.error) throw publicationRes.error;
  if (snapshotRes.error) throw snapshotRes.error;
  const publications = (publicationRes.data || []) as PublicationInput[];
  const publicationIds = new Set(publications.map((publication) => publication.id));
  const snapshots = ((snapshotRes.data || []) as SnapshotInput[]).filter((snapshot) => publicationIds.has(snapshot.publication_id));
  const leads = contactRes.error ? [] : (contactRes.data || []).map(extractLead);
  const posts = calculatePostPerformance(publications, snapshots, leads);
  const recommendations = buildGrowthRecommendations(posts);
  const patternInsights = buildFeatureInsights(posts);
  const learningRanking = rankFeatureInsights(patternInsights, posts);

  const totals = posts.reduce((sum, post) => ({
    views: sum.views + post.views,
    reach: sum.reach + post.reach,
    interactions: sum.interactions + post.interactions,
    shares: sum.shares + post.shares,
    saves: sum.saves + post.saves,
    leads: sum.leads + post.leads,
  }), { views: 0, reach: 0, interactions: 0, shares: 0, saves: 0, leads: 0 });

  return {
    generatedAt: new Date().toISOString(),
    totals,
    posts: posts.map((post) => ({
      ...post,
      trackingUrl: buildTrackingUrl(
        process.env.NEXT_PUBLIC_SOCIAL_LEAD_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://realtyflow.chatgenius.pro',
        { id: post.id, brand_id: post.brand },
      ),
    })),
    recommendations,
    patternInsights,
    learningRanking,
    experiments: experimentRes.error ? [] : experimentRes.data || [],
    dataQuality: {
      publicationCount: publications.length,
      trackedPostCount: posts.filter((post) => post.reach > 0 || post.views > 0).length,
      attributedLeadCount: totals.leads,
      highConfidenceCount: posts.filter((post) => post.confidence === 'high').length,
      autopilotEligiblePatternCount: learningRanking.filter((item) => item.autopilotEligible).length,
    },
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { posts: [], recommendations: [] });
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json(await loadWorkspace(clean(request.nextUrl.searchParams.get('brand_id')) || undefined));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kunne ikke bygge vekstanalysen.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'create_variant') {
    return NextResponse.json({ error: 'Ukjent handling.' }, { status: 400 });
  }
  const sourceId = clean(body.publicationId);
  if (!sourceId) return NextResponse.json({ error: 'publicationId mangler.' }, { status: 400 });

  try {
    const supabase = createServerClient();
    const { data: source, error } = await supabase.from('content_publications').select('*').eq('id', sourceId).maybeSingle();
    if (error || !source) return NextResponse.json({ error: 'Kildeinnlegget finnes ikke.' }, { status: 404 });

    const variantId = crypto.randomUUID();
    const destination = clean(body.destinationUrl) || process.env.NEXT_PUBLIC_APP_URL || 'https://realtyflow.chatgenius.pro';
    const trackingUrl = buildTrackingUrl(destination, { id: variantId, brand_id: source.brand_id });
    const hook = clean(body.hook) || `Dette bør du vite før du velger ${source.content_features?.area || 'boligområde'}`;
    const variantDescription = `${hook}\n\n${source.description || ''}`.trim();
    const { data: variant, error: insertError } = await supabase.from('content_publications').insert({
      id: variantId,
      brand_id: source.brand_id,
      content_type: source.content_type,
      title: `Testvariant: ${source.title || 'Instagram-innlegg'}`,
      description: variantDescription,
      tags: source.tags || [],
      media_urls: source.media_urls || [],
      ai_generated: true,
      ai_title: hook,
      ai_description: variantDescription,
      ai_tags: source.ai_tags || source.tags || [],
      status: 'draft',
      performance_goal: clean(body.successMetric) || 'lead_rate',
      source_social_post_id: source.source_social_post_id || null,
      tracking_slug: variantId,
      tracking_url: trackingUrl,
      content_features: {
        ...(source.content_features || {}),
        experiment_source_id: sourceId,
        variant_type: clean(body.variantType) || 'new_hook',
      },
    }).select('*').single();
    if (insertError) throw insertError;

    const hypothesis = clean(body.hypothesis) || 'En tydeligere åpning og sporbar CTA vil øke lead-raten.';
    const { data: experiment, error: experimentError } = await supabase.from('social_growth_experiments').insert({
      brand_id: source.brand_id,
      platform: 'instagram',
      source_publication_id: sourceId,
      variant_publication_id: variantId,
      hypothesis,
      success_metric: clean(body.successMetric) || 'lead_rate',
      status: 'planned',
      evidence: { source_title: source.title, tracking_url: trackingUrl },
    }).select('*').single();
    if (experimentError) throw experimentError;
    return NextResponse.json({ variant, experiment, trackingUrl }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kunne ikke lage varianten.' }, { status: 500 });
  }
}
