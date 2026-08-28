import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';
import { buildTrackingUrl } from '@/services/social-growth/performance-engine';

/**
 * POST /api/marketing-kit/drafts
 * Create draft posts in content_publications from marketing kit content.
 * Growth-originated drafts keep a durable growth_action_id and post-level UTM
 * tracking URL so leads can later be attributed back to the originating action.
 */
export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(req);
    if (unauthorized) return unauthorized;

    const { drafts, property_id } = await req.json();

    if (!drafts || !Array.isArray(drafts) || drafts.length === 0) {
      return NextResponse.json({ error: 'drafts array is required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(url, key);
    const trackingBaseUrl = process.env.NEXT_PUBLIC_SOCIAL_LEAD_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://realtyflow.chatgenius.pro';

    const results = [];
    for (const draft of drafts) {
      const publicationId = crypto.randomUUID();
      const brandId = String(draft.brand_id || 'zeneco').trim();
      const scheduledPlatforms = draft.scheduled_platforms || (draft.metadata?.platform ? [draft.metadata.platform] : []);
      const growthActionId = typeof draft.growth_action_id === 'string' ? draft.growth_action_id.trim() : '';
      const contentFeatures = {
        ...(draft.content_features && typeof draft.content_features === 'object' ? draft.content_features : {}),
        ...(draft.metadata && typeof draft.metadata === 'object' ? draft.metadata : {}),
        ...(growthActionId ? { growth_action_id: growthActionId, source: 'growth_engine' } : {}),
      };
      const trackingUrl = buildTrackingUrl(trackingBaseUrl, { id: publicationId, brand_id: brandId });

      const { data, error } = await supabase
        .from('content_publications')
        .insert({
          id: publicationId,
          brand_id: brandId,
          content_type: draft.content_type || 'marketing_post',
          title: draft.title,
          description: draft.description,
          tags: draft.tags || [],
          status: 'draft',
          ai_generated: true,
          ai_title: draft.title,
          ai_description: draft.description,
          ai_tags: draft.tags || [],
          scheduled_platforms: scheduledPlatforms,
          performance_goal: draft.performance_goal || (growthActionId ? 'lead_rate' : null),
          tracking_slug: publicationId,
          tracking_url: trackingUrl,
          content_features: contentFeatures,
          ...(draft.ai_image_url ? { ai_image_url: draft.ai_image_url } : {}),
        })
        .select('id, title, status, tracking_url, content_features')
        .single();

      if (error) {
        console.error('[Marketing Kit Drafts] Insert error:', error.message);
        results.push({ platform: draft.metadata?.platform, success: false, error: error.message });
      } else {
        results.push({
          platform: draft.metadata?.platform,
          success: true,
          id: data.id,
          tracking_url: data.tracking_url,
          growth_action_id: growthActionId || null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      property_id,
      drafts_created: results.filter(r => r.success).length,
      results,
    });
  } catch (error) {
    console.error('[Marketing Kit Drafts]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
