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
 * GET /api/saas/opportunities
 * List all opportunities with optional status filter
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supabase = getSupabase();

    if (!supabase) {
      // Return mock data if no DB
      const scanner = new SaaSOpportunityScanner();
      const { opportunities } = await scanner.discoverOpportunities();
      return NextResponse.json({
        opportunities: opportunities.map((o, i) => ({
          id: `mock-${i}`,
          ...o,
          status: 'discovered',
          created_at: new Date().toISOString(),
        })),
      });
    }

    let query = supabase
      .from('saas_opportunities')
      .select('*')
      .order('opportunity_score', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      if (status === 'active') {
        // All non-rejected, non-archived
        query = query.not('status', 'in', '("rejected","archived")');
      } else {
        query = query.eq('status', status);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    // Also get latest discovery run info
    const { data: latestRun } = await supabase
      .from('saas_discovery_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      opportunities: data || [],
      latest_scan: latestRun || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/saas/opportunities
 * Actions: discover, refine, update_status, generate_build_prompt
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = getSupabase();
    const scanner = new SaaSOpportunityScanner();

    switch (action) {
      // ── Discover new opportunities ───────────────────────────────
      case 'discover': {
        const { opportunities, raw_analysis } = await scanner.discoverOpportunities();

        if (supabase) {
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

          const { data: inserted, error } = await supabase
            .from('saas_opportunities')
            .insert(toInsert)
            .select();

          if (error) {
            console.error('[SaaS Discovery] Insert error:', error);
          }

          // Log discovery run
          try {
            await supabase.from('saas_discovery_runs').insert({
              run_type: 'manual',
              opportunities_found: opportunities.length,
              categories_scanned: Array.from(new Set(opportunities.map((o) => o.category))),
              ai_model: 'claude-sonnet-4-20250514',
              raw_analysis,
            });
          } catch {
            // non-critical
          }

          return NextResponse.json({
            success: true,
            opportunities: inserted || toInsert,
            count: opportunities.length,
          });
        }

        return NextResponse.json({
          success: true,
          opportunities: opportunities.map((o, i) => ({ id: `new-${i}`, ...o, status: 'discovered' })),
          count: opportunities.length,
        });
      }

      // ── Update status (approve, reject, investigate, etc.) ──────
      case 'update_status': {
        const { id, status, user_feedback } = body;
        if (!id || !status) {
          return NextResponse.json({ error: 'id and status required' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {
          status,
          updated_at: new Date().toISOString(),
        };

        if (user_feedback) updates.user_feedback = user_feedback;
        if (status === 'approved') updates.approved_at = new Date().toISOString();
        if (status === 'building') updates.build_started_at = new Date().toISOString();
        if (status === 'deployed') updates.deployed_at = new Date().toISOString();

        if (supabase) {
          const { data, error } = await supabase
            .from('saas_opportunities')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          return NextResponse.json({ success: true, opportunity: data });
        }

        return NextResponse.json({ success: true, opportunity: { id, ...updates } });
      }

      // ── Refine an opportunity ───────────────────────────────────
      case 'refine': {
        const { id, title, description, category, target_audience, competitors, mvp_features, user_feedback } = body;

        const refined = await scanner.refineOpportunity({
          title,
          description,
          category,
          target_audience,
          competitors: competitors || [],
          mvp_features: mvp_features || [],
          user_feedback,
        });

        if (supabase && id) {
          const { data, error } = await supabase
            .from('saas_opportunities')
            .update({
              status: 'refining',
              business_plan: refined.business_plan,
              refinement_notes: refined.refinement_notes,
              mvp_features: refined.updated_mvp_features,
              differentiators: refined.updated_differentiators,
              suggested_pricing: refined.updated_pricing,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          return NextResponse.json({ success: true, opportunity: data, refined });
        }

        return NextResponse.json({ success: true, refined });
      }

      // ── Generate build prompt for Claude Code ──────────────────
      case 'generate_build_prompt': {
        const { id: oppId, title: oppTitle, slug: oppSlug, description: oppDesc, mvp_features: oppFeatures, tech_stack_suggestion: oppTech, business_plan: oppPlan, suggested_pricing: oppPricing } = body;

        const prompt = await scanner.generateBuildPrompt({
          title: oppTitle,
          slug: oppSlug,
          description: oppDesc,
          mvp_features: oppFeatures || [],
          tech_stack_suggestion: oppTech || ['next.js', 'supabase', 'stripe'],
          business_plan: oppPlan,
          suggested_pricing: oppPricing,
        });

        if (supabase && oppId) {
          await supabase
            .from('saas_opportunities')
            .update({
              status: 'approved',
              approved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', oppId);
        }

        return NextResponse.json({ success: true, build_prompt: prompt });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[SaaS Opportunities] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/saas/opportunities
 * Update opportunity fields
 */
export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 503 });

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('saas_opportunities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, opportunity: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}
