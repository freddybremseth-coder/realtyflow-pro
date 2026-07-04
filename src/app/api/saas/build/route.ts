import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-admin';
import { getSaasSupabase } from '@/lib/saas-api-supabase';
import { SaaSOpportunityScanner } from '@/services/saas/opportunity-scanner';

function getSupabase() {
  return getSaasSupabase();
}

/**
 * POST /api/saas/build
 * Saves the build task to Supabase queue instead of building inline.
 * Generates the build prompt and marks opportunity as queued_for_build.
 * The actual build is done by Claude Code picking up queued tasks.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const {
      opportunity_id,
      title,
      slug,
      description,
      mvp_features,
      suggested_pricing,
      target_audience,
      category,
      tech_stack_suggestion,
      business_plan,
    } = body;

    if (!slug || !title) {
      return NextResponse.json(
        { error: 'slug and title are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    // Generate the build prompt using the opportunity scanner
    const scanner = new SaaSOpportunityScanner();
    const buildPrompt = await scanner.generateBuildPrompt({
      title,
      slug,
      description: description || '',
      mvp_features: mvp_features || [],
      tech_stack_suggestion: tech_stack_suggestion || ['next.js', 'supabase', 'stripe'],
      business_plan: business_plan || '',
      suggested_pricing: suggested_pricing || '',
    });

    console.log(`[SaaS Build] Queuing build task for: ${title} (${slug})`);

    // Save build prompt and mark as queued_for_build
    if (opportunity_id) {
      const { error } = await supabase
        .from('saas_opportunities')
        .update({
          status: 'queued_for_build',
          build_prompt: buildPrompt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', opportunity_id);

      if (error) {
        console.error('[SaaS Build] Failed to queue build task:', error);
        return NextResponse.json(
          { error: 'Failed to save build task: ' + error.message },
          { status: 500 }
        );
      }
    }

    console.log(`[SaaS Build] Build task queued for: ${title}`);

    return NextResponse.json({
      success: true,
      build_prompt: buildPrompt,
      message: `Byggoppgave for "${title}" er lagret og klar for Claude Code.`,
    });
  } catch (error) {
    console.error('[SaaS Build] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to queue build task',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/saas/build
 * Check build status and list queued tasks
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { ready: false });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();

  if (!supabase) {
    return NextResponse.json({
      ready: false,
      message: 'Database not configured',
    });
  }

  // Get queued build tasks
  const { data: queuedTasks, error } = await supabase
    .from('saas_opportunities')
    .select('id, title, slug, status, build_prompt, updated_at')
    .eq('status', 'queued_for_build')
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ready: true,
    queued_tasks: queuedTasks || [],
    message: queuedTasks && queuedTasks.length > 0
      ? `${queuedTasks.length} byggoppgave(r) i ko.`
      : 'Ingen byggoppgaver i ko.',
  });
}
