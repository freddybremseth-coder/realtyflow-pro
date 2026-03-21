import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MarketDataFetcher } from '@/services/market/data-fetcher';

// Vercel cron: "crons": [{ "path": "/api/cron/market-data", "schedule": "0 3 * * *" }]

export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// GET /api/cron/market-data — nightly cron to fetch and save market data
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Fetch all external data
    const fetcher = new MarketDataFetcher();
    const marketData = await fetcher.fetchAll(supabase);

    // Extract key values for snapshot columns
    const eurNok = marketData.exchangeRates.find(r => r.pair === 'EUR/NOK');
    const eurSek = marketData.exchangeRates.find(r => r.pair === 'EUR/SEK');
    const eurGbp = marketData.exchangeRates.find(r => r.pair === 'EUR/GBP');

    // Save snapshot
    const { error } = await supabase.from('market_data_snapshots').insert({
      eur_nok: eurNok?.rate || null,
      eur_nok_7d_change: eurNok?.change7d || null,
      eur_sek: eurSek?.rate || null,
      eur_gbp: eurGbp?.rate || null,
      ecb_rate: marketData.ecbRate.rate || null,
      ecb_rate_previous: marketData.ecbRate.previousRate || null,
      idealista_news: marketData.idealistaNews,
      internal_metrics: marketData.internalMetrics,
      raw_data: marketData,
      sources: ['ecb', 'idealista', 'supabase'],
      fetched_at: marketData.fetchedAt,
    });

    if (error) throw error;

    const dataPoints =
      marketData.exchangeRates.length +
      (marketData.ecbRate.rate ? 1 : 0) +
      marketData.idealistaNews.length;

    console.log(`[Cron: market-data] Saved snapshot with ${dataPoints} data points`);

    return NextResponse.json({ success: true, data_points: dataPoints });
  } catch (error) {
    console.error('[Cron: market-data]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
