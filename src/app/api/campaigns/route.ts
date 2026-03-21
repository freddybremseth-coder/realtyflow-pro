import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/campaigns
 * List campaigns, optionally filtered by brandId
 */
export async function GET(request: NextRequest) {
  try {
    const brandId = request.nextUrl.searchParams.get('brandId');
    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json({ campaigns: [], source: 'not-configured' });
    }

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Campaigns] GET error:', error);
      return NextResponse.json({ campaigns: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaigns: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns
 * Create a new campaign. Optionally uses CEO agent for strategy generation.
 * Body: { brandId, name, goal, platforms[], contentTypes[], targetAudience, useAI? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brandId, name, goal, platforms, contentTypes, targetAudience, description } = body;

    if (!brandId || !name) {
      return NextResponse.json({ error: 'brandId and name are required' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    // Create campaign record
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        brand_id: brandId,
        name,
        goal: goal || '',
        description: description || '',
        platforms: platforms || [],
        content_types: contentTypes || [],
        target_audience: targetAudience || '',
        status: 'planning',
      })
      .select()
      .single();

    if (error) {
      console.error('[Campaigns] Create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If useAI flag is set, generate strategy with CEO agent
    if (body.useAI) {
      try {
        const { CEOAgent } = await import('@/services/agents/ceo-agent');
        const ceo = new CEOAgent();
        const results = await ceo.executeTasks([{
          id: `strategy_${data.id}`,
          name: 'create_campaign',
          description: `Lag en kampanjestrategi for brand "${brandId}". Mål: ${goal}. Plattformer: ${(platforms || []).join(', ')}. Målgruppe: ${targetAudience || 'ikke spesifisert'}.`,
          priority: 'high',
          status: 'pending',
        }]);
        const strategy = results[0];

        if (strategy.output) {
          let strategyData;
          try { strategyData = JSON.parse(strategy.output); } catch { strategyData = { plan: strategy.output }; }

          await supabase
            .from('campaigns')
            .update({ strategy: strategyData })
            .eq('id', data.id);

          data.strategy = strategyData;
        }
      } catch (aiErr) {
        console.warn('[Campaigns] AI strategy generation failed:', aiErr);
      }
    }

    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create campaign' },
      { status: 500 }
    );
  }
}
