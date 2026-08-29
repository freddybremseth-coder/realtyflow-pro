import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

/**
 * POST /api/marketing-kit/drafts
 * Create draft posts in content_publications from marketing kit content.
 * Body: { drafts: [...], property_id: string }
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

    const results = [];
    for (const draft of drafts) {
      const brandId = draft.brand_id || 'zeneco';
      const requestedTags = Array.isArray(draft.tags) ? draft.tags.map(String).filter(Boolean) : [];
      let growthActionId = typeof draft.growth_action_id === 'string' ? draft.growth_action_id.trim() : '';

      // Backward compatible attribution for Growth Hub callers that predate
      // growth_action_id: exact brand + content match only, never fuzzy match.
      if (!growthActionId && requestedTags.includes('growth-engine') && draft.description) {
        const { data: action } = await supabase
          .from('growth_actions')
          .select('id')
          .eq('brand', brandId)
          .eq('content', draft.description)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        growthActionId = action?.id ? String(action.id) : '';
      }

      const tags = Array.from(new Set([
        ...requestedTags,
        ...(growthActionId ? [`growth-action:${growthActionId}`] : []),
      ]));

      const { data, error } = await supabase
        .from('content_publications')
        .insert({
          brand_id: brandId,
          content_type: draft.content_type || 'marketing_post',
          title: draft.title,
          description: draft.description,
          tags,
          status: 'draft',
          ai_generated: true,
          ai_title: draft.title,
          ai_description: draft.description,
          ai_tags: tags,
          scheduled_platforms: draft.scheduled_platforms || (draft.metadata?.platform ? [draft.metadata.platform] : []),
          ...(draft.ai_image_url ? { ai_image_url: draft.ai_image_url } : {}),
        })
        .select('id, title, status')
        .single();

      if (error) {
        console.error('[Marketing Kit Drafts] Insert error:', error.message);
        results.push({ platform: draft.metadata?.platform, success: false, error: error.message });
      } else {
        results.push({
          platform: draft.metadata?.platform,
          success: true,
          id: data.id,
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
