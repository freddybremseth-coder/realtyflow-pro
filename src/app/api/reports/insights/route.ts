import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS market_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  summary TEXT,
  details TEXT NOT NULL,
  sources TEXT[] DEFAULT '{}',
  source_type TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE market_insights ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'market_insights' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON market_insights FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

async function ensureTable() {
  // Try via raw REST with service role key
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: CREATE_TABLE_SQL }),
    });
  } catch {}
}

/**
 * GET /api/reports/insights - List saved market insights
 */
export async function GET(req: NextRequest) {
  const unauthorized = await requireAdminApi(req, { insights: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ insights: [] });

  const { data, error } = await supabase
    .from('market_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.log('[Insights API] GET error:', error.message);
    // Table might not exist yet
    if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return NextResponse.json({ insights: [], tableNotReady: true });
    }
    return NextResponse.json({ insights: [] });
  }

  return NextResponse.json({ insights: data || [] });
}

/**
 * POST /api/reports/insights - Save a manual market insight
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

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

    // If table doesn't exist, try to create it then retry
    if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
      await ensureTable();
      // Retry once
      const { data: retryData, error: retryErr } = await supabase
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

      if (retryErr) {
        return NextResponse.json(
          { error: 'Tabellen "market_insights" mangler i Supabase. Kjør SQL-migrasjonen i Supabase Dashboard: supabase/migrations/20260412_market_insights.sql' },
          { status: 503 }
        );
      }
      return NextResponse.json({ insight: retryData });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ insight: data });
}

/**
 * DELETE /api/reports/insights - Delete an insight
 */
export async function DELETE(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('market_insights').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
