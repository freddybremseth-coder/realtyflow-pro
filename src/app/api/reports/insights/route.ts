import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/reports/insights - List saved market insights
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ insights: [] });

  const { data, error } = await supabase
    .from('market_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    // Table might not exist yet - return empty
    console.log('[Insights API] Error:', error.message);
    return NextResponse.json({ insights: [] });
  }

  return NextResponse.json({ insights: data || [] });
}

/**
 * POST /api/reports/insights - Save a manual market insight
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const body = await req.json();
  const { topic, summary, details, sources } = body;

  if (!details || !topic) {
    return NextResponse.json({ error: 'topic and details required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('market_insights')
    .insert({
      topic,
      summary: summary || details.substring(0, 300),
      details,
      sources: sources || ['Manuell input'],
      source_type: 'manual',
    })
    .select()
    .single();

  if (error) {
    console.error('[Insights API] Insert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ insight: data });
}

/**
 * DELETE /api/reports/insights - Delete an insight
 */
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('market_insights').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
