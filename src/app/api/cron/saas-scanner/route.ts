export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SaaSOpportunityScanner } from '@/services/saas/opportunity-scanner';

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/cron/saas-scanner
 * Weekly Monday scan for SaaS opportunities
 * Runs every Monday at 07:00 UTC
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret in production
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Allow without auth for development
      if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = getSupabase();
    const scanner = new SaaSOpportunityScanner();

    console.log('[SaaS Scanner Cron] Starting weekly scan...');

    const { opportunities, raw_analysis } = await scanner.discoverOpportunities();

    if (supabase && opportunities.length > 0) {
      // Save opportunities
      const toInsert = opportunities.map((o) => ({
        title: o.title,
        slug: o.slug,
        description: o.description,
        category: o.category,
        problem_statement: o.problem_statement,
        target_audience: o.target_audience,
        market_size: o.market_size,
        competitor_count: o.competitor_count,
        competitors: o.competitors,
        competitor_weakness: o.competitor_weakness,
        opportunity_score: o.opportunity_score,
        suggested_pricing: o.suggested_pricing,
        estimated_mrr_potential: o.estimated_mrr_potential,
        monetization_strategy: o.monetization_strategy,
        tech_stack_suggestion: o.tech_stack_suggestion,
        build_complexity: o.build_complexity,
        estimated_build_days: o.estimated_build_days,
        mvp_features: o.mvp_features,
        differentiators: o.differentiators,
        trend_keywords: o.trend_keywords,
        trend_sources: o.trend_sources,
        trend_momentum: o.trend_momentum,
        search_volume_trend: o.search_volume_trend,
        status: 'discovered',
      }));

      const { error: insertError } = await supabase
        .from('saas_opportunities')
        .insert(toInsert);

      if (insertError) {
        console.error('[SaaS Scanner Cron] Insert error:', insertError);
      }

      // Log discovery run
      try {
        await supabase.from('saas_discovery_runs').insert({
          run_type: 'weekly',
          opportunities_found: opportunities.length,
          categories_scanned: Array.from(new Set(opportunities.map((o) => o.category))),
          ai_model: 'claude-sonnet-4-20250514',
          raw_analysis,
        });
      } catch {
        // non-critical
      }
    }

    console.log(`[SaaS Scanner Cron] Found ${opportunities.length} opportunities`);

    return NextResponse.json({
      success: true,
      opportunities_found: opportunities.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[SaaS Scanner Cron] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scan failed' },
      { status: 500 }
    );
  }
}
