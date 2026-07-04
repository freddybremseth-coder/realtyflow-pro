import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AutonomousGrowthEngine } from '@/services/growth/growth-engine';
import { requireAdminApi } from '@/lib/api-admin';

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET: Returns recent growth actions and current strategy
export async function GET(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request, { success: false, actions: [] });
    if (adminError) return adminError;

    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!supabase) {
      // Return empty data if no Supabase (don't run heavy AI cycle on GET)
      return NextResponse.json({
        success: true,
        actions: [],
        strategy: null,
        message: 'Supabase not configured',
      });
    }

    // Fetch recent actions
    let query = supabase
      .from('growth_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (brand) {
      query = query.eq('brand', brand);
    }

    const { data: actions, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Get strategy for requested brand
    let strategy = null;
    if (brand) {
      try {
        const engine = new AutonomousGrowthEngine(supabase);
        strategy = await engine.getStrategyForBrand(brand);
      } catch {
        // Strategy generation is optional
      }
    }

    return NextResponse.json({
      success: true,
      actions: actions || [],
      strategy,
      total: actions?.length || 0,
    });
  } catch (err) {
    console.error('[GrowthEngine API] GET error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// POST: Trigger a growth cycle or specific action
export async function POST(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request);
    if (adminError) return adminError;

    const body = await request.json();
    const {
      brands,
      action,
      brand,
    }: {
      brands?: string[];
      action?: 'run_cycle' | 'generate_lead_magnet' | 'analyze' | 'ab_test';
      brand?: string;
    } = body;

    const supabase = getSupabase();
    const engine = new AutonomousGrowthEngine(supabase || undefined);

    switch (action) {
      case 'generate_lead_magnet': {
        if (!brand) {
          return NextResponse.json(
            { success: false, error: 'Brand is required for lead magnet generation' },
            { status: 400 }
          );
        }

        const leadMagnet = await engine.generateLeadMagnet(brand);

        // Save to Supabase if available
        if (supabase) {
          await supabase.from('lead_magnets').insert(leadMagnet);
        }

        return NextResponse.json({ success: true, lead_magnet: leadMagnet });
      }

      case 'analyze': {
        const analysis = await engine.analyzeAndLearn();

        // Transform string arrays into Insight objects for the frontend
        const insights = [
          ...(analysis.insights || []).map((text: string, i: number) => ({
            id: `insight-${i}`,
            type: i === 0 ? 'trend' : 'improvement',
            title: text.split('.')[0] || text,
            description: text,
          })),
          ...(analysis.recommendations || []).map((text: string, i: number) => ({
            id: `rec-${i}`,
            type: 'recommendation',
            title: text.split('.')[0] || text,
            description: text,
          })),
        ];

        return NextResponse.json({ success: true, insights, analysis });
      }

      case 'ab_test': {
        if (!brand) {
          return NextResponse.json(
            { success: false, error: 'Brand is required for A/B test generation' },
            { status: 400 }
          );
        }

        const contentType = body.content_type || 'social_post';
        const abTest = await engine.generateAbTest(brand, contentType);

        // Save to Supabase so it persists and shows on reload
        const abRecord = {
          brand,
          action_type: contentType,
          platform: 'ab_test',
          content: abTest.a,
          content_b: abTest.b,
          hypothesis: abTest.hypothesis,
          status: 'planned',
          priority: 3,
        };

        let savedId = `ab-${Date.now()}`;
        if (supabase) {
          const { data: saved, error: saveErr } = await supabase
            .from('growth_actions')
            .insert(abRecord)
            .select('id')
            .single();
          if (saved?.id) savedId = saved.id;
          if (saveErr) console.error('[GrowthEngine] A/B save error:', saveErr);
        }

        return NextResponse.json({
          success: true,
          ab_test: {
            id: savedId,
            brand_id: brand,
            content_type: contentType,
            variant_a: abTest.a,
            variant_b: abTest.b,
            hypothesis: abTest.hypothesis,
            status: 'planned',
            created_at: new Date().toISOString(),
          },
        });
      }

      case 'run_cycle':
      default: {
        // Limit to max 1 brand per API call to stay within serverless timeout
        let targetBrands = brands || (brand ? [brand] : undefined);
        if (!targetBrands || targetBrands.length === 0) {
          // Pick a random brand if none specified
          const allBrandIds = ['soleada', 'zeneco', 'chatgenius', 'donaanna', 'freddyb', 'pinosoecolife', 'neuralbeat'];
          targetBrands = [allBrandIds[Math.floor(Math.random() * allBrandIds.length)]];
        } else if (targetBrands.length > 2) {
          targetBrands = targetBrands.slice(0, 2);
        }
        const actions = await engine.runCycle(targetBrands);

        // Save to Supabase if available
        if (supabase && actions.length > 0) {
          const { error } = await supabase
            .from('growth_actions')
            .insert(actions);

          if (error) {
            console.error('[GrowthEngine API] Save error:', error);
          }
        }

        return NextResponse.json({
          success: true,
          actions,
          total: actions.length,
          brands_processed: Array.from(new Set(actions.map((a) => a.brand))),
        });
      }
    }
  } catch (err) {
    console.error('[GrowthEngine API] POST error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
