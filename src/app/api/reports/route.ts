import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MarketDataFetcher } from '@/services/market/data-fetcher';
import { ReportGenerator } from '@/services/market/report-generator';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// GET /api/reports — list reports or latest snapshot
// Supports: ?limit=20&template=tall-og-trender&snapshot=latest
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);

    // Return latest market data snapshot
    if (searchParams.get('snapshot') === 'latest') {
      const { data } = await supabase
        .from('market_data_snapshots')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single();

      return NextResponse.json({ snapshot: data });
    }

    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const template = searchParams.get('template');

    let query = supabase
      .from('market_reports')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (template) {
      query = query.eq('template_id', template);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ reports: data || [] });
  } catch (error) {
    console.error('[Reports GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/reports — generate a new report
// Body: { template_id?: string, theme?: string, brand?: string }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    let { template_id, theme, brand } = body as {
      template_id?: string;
      theme?: string;
      brand?: string;
    };

    // 1. Fetch all market data
    const fetcher = new MarketDataFetcher();
    const marketData = await fetcher.fetchAll(supabase);

    // 2. Determine template if not provided
    const generator = new ReportGenerator();

    if (!template_id) {
      const { data: recentReports } = await supabase
        .from('market_reports')
        .select('template_id, generated_at')
        .order('generated_at', { ascending: false })
        .limit(8);

      template_id = generator.getNextTemplate(
        (recentReports ?? []).map(r => ({
          template_id: r.template_id,
          date: r.generated_at,
        }))
      );
    }

    // 3. Generate the report with Claude
    const report = await generator.generateReport(template_id, marketData, { theme, brand });

    // 4. Save to Supabase
    const { data: saved, error } = await supabase
      .from('market_reports')
      .insert({
        template_id: report.template_id,
        title: report.title,
        subtitle: report.subtitle,
        summary: report.summary,
        content_html: report.content_html,
        content_text: report.content_text,
        key_metrics: report.key_metrics,
        sections: report.sections,
        theme: report.theme,
        brand: report.brand,
        recipients: report.recipients,
        data_sources: report.data_sources,
        generated_at: report.generated_at,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ report: saved }, { status: 201 });
  } catch (error) {
    console.error('[Reports POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
