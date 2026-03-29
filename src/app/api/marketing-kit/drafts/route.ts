import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/marketing-kit/drafts
 * Create draft posts in content_publications from marketing kit content.
 * Body: { drafts: [...], property_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { drafts, property_id } = await req.json();

    if (!drafts || !Array.isArray(drafts) || drafts.length === 0) {
      return NextResponse.json({ error: 'drafts array is required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(url, key);

    const results = [];
    for (const draft of drafts) {
      const { data, error } = await supabase
        .from('content_publications')
        .insert({
          brand_id: draft.brand_id || 'zeneco',
          content_type: draft.content_type || 'marketing_post',
          title: draft.title,
          description: draft.description,
          tags: draft.tags || [],
          status: 'draft',
          ai_generated: true,
          ai_title: draft.title,
          ai_description: draft.description,
          ai_tags: draft.tags || [],
          ...(draft.ai_image_url ? { ai_image_url: draft.ai_image_url } : {}),
        })
        .select('id, title, status')
        .single();

      if (error) {
        console.error('[Marketing Kit Drafts] Insert error:', error.message);
        results.push({ platform: draft.metadata?.platform, success: false, error: error.message });
      } else {
        results.push({ platform: draft.metadata?.platform, success: true, id: data.id });
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
