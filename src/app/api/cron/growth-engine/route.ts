export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AutonomousGrowthEngine } from '@/services/growth/growth-engine';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';

// Vercel cron: "crons": [{ "path": "/api/cron/growth-engine", "schedule": "0 6 * * *" }]
// Runs daily at 06:00 UTC

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  try {
    // 1. Verify CRON_SECRET
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const safeMode = await evaluateCronSafeMode('/api/cron/growth-engine');
    if (safeMode.skip) {
      return NextResponse.json({
        success: true,
        skipped: true,
        mode: safeMode.mode,
        reason: safeMode.reason,
      });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const engine = new AutonomousGrowthEngine(supabase);
    const startTime = Date.now();

    // 2. Run a growth cycle for ALL brands
    const actions = await engine.runCycle();

    // 3. Save actions to Supabase
    if (actions.length > 0) {
      const { error: insertError } = await supabase
        .from('growth_actions')
        .insert(actions);

      if (insertError) {
        console.error('[GrowthCron] Failed to save actions:', insertError);
      }
    }

    // 4. Pick top 3 actions by priority and mark as 'ready'
    const topActions = [...actions]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);

    for (const action of topActions) {
      if (action.status !== 'ready') {
        await supabase
          .from('growth_actions')
          .update({ status: 'ready' })
          .eq('id', action.id);
      }
    }

    // 5. Run analyzeAndLearn() to update strategy
    const analysis = await engine.analyzeAndLearn();

    // Save analysis results as a strategy snapshot
    const analysisRecord = {
      id: `analysis_${Date.now()}`,
      type: 'daily_analysis',
      insights: analysis.insights,
      recommendations: analysis.recommendations,
      actions_generated: actions.length,
      top_actions: topActions.map((a) => ({
        id: a.id,
        brand: a.brand,
        type: a.action_type,
        platform: a.platform,
        priority: a.priority,
      })),
      created_at: new Date().toISOString(),
    };

    await supabase.from('growth_analysis_logs').insert(analysisRecord);

    const duration = Date.now() - startTime;

    // 6. Return summary
    return NextResponse.json({
      success: true,
      summary: {
        actions_generated: actions.length,
        brands_processed: Array.from(new Set(actions.map((a) => a.brand))),
        top_actions: topActions.map((a) => ({
          brand: a.brand,
          type: a.action_type,
          platform: a.platform,
          priority: a.priority,
          status: 'ready',
        })),
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[GrowthCron] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Cron execution failed',
      },
      { status: 500 }
    );
  }
}
