import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { tests: [] });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ tests: [] });

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brand') || searchParams.get('brand_id');

  // A/B tests are growth_actions that have content_b (variant B)
  let query = supabase
    .from('growth_actions')
    .select('*')
    .not('content_b', 'is', null)
    .order('created_at', { ascending: false });

  if (brandId) query = query.eq('brand', brandId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ tests: [], error: error.message });

  // Map to A/B test format
  const tests = (data || []).map((action) => ({
    id: action.id,
    brand_id: action.brand,
    content_type: action.action_type,
    variant_a: action.content,
    variant_b: action.content_b,
    hypothesis: action.hypothesis,
    metrics_a: {
      impressions: action.impressions || 0,
      clicks: action.clicks || 0,
      conversions: action.conversions || 0,
    },
    metrics_b: {
      impressions: action.impressions_b || 0,
      clicks: action.clicks_b || 0,
      conversions: action.conversions_b || 0,
    },
    winner: action.ab_winner,
    status: action.content_b ? (action.ab_winner ? 'completed' : 'running') : action.status,
    created_at: action.created_at,
  }));

  return NextResponse.json({ tests });
}

export async function PATCH(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id, winner, ...metrics } = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (winner) updates.ab_winner = winner;
  if (metrics.metrics_a) {
    updates.impressions = metrics.metrics_a.impressions;
    updates.clicks = metrics.metrics_a.clicks;
    updates.conversions = metrics.metrics_a.conversions;
  }
  if (metrics.metrics_b) {
    updates.impressions_b = metrics.metrics_b.impressions;
    updates.clicks_b = metrics.metrics_b.clicks;
    updates.conversions_b = metrics.metrics_b.conversions;
  }

  const { data, error } = await supabase.from('growth_actions').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ test: data });
}
