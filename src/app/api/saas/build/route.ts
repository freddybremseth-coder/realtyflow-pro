import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SaaSAutoDeployer } from '@/services/saas/auto-deployer';

export const maxDuration = 300; // 5 minutes for full build + deploy

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/saas/build
 * Triggers the full auto-build pipeline:
 * 1. Generate app code from opportunity data
 * 2. Create GitHub repo
 * 3. Push all files
 * 4. Deploy to Vercel
 * 5. Update opportunity status + create saas_app entry
 */
export async function POST(request: NextRequest) {
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
      color,
    } = body;

    if (!slug || !title) {
      return NextResponse.json(
        { error: 'slug and title are required' },
        { status: 400 }
      );
    }

    // Check required env vars
    const missing: string[] = [];
    if (!process.env.GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
    if (!process.env.VERCEL_TOKEN) missing.push('VERCEL_TOKEN');
    if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Mangler miljøvariabler: ${missing.join(', ')}. Legg til i Vercel Dashboard → Settings → Environment Variables.`,
          missing_env_vars: missing,
        },
        { status: 503 }
      );
    }

    const deployer = new SaaSAutoDeployer();
    const supabase = getSupabase();

    console.log(`[SaaS Build] Starting auto-build for: ${title} (${slug})`);

    // Update opportunity status to "building"
    if (supabase && opportunity_id) {
      await supabase
        .from('saas_opportunities')
        .update({
          status: 'building',
          build_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', opportunity_id);
    }

    // Run the full build pipeline
    const result = await deployer.buildAndDeploy({
      title,
      slug,
      description: description || '',
      features: mvp_features || [],
      pricing: suggested_pricing || 'Free + $19/mo Pro + $49/mo Business',
      color: color || '#8b5cf6',
      target_audience: target_audience || '',
      category: category || 'ai',
    });

    if (!result.success) {
      // Update status back to approved on failure
      if (supabase && opportunity_id) {
        await supabase
          .from('saas_opportunities')
          .update({
            status: 'approved',
            updated_at: new Date().toISOString(),
          })
          .eq('id', opportunity_id);
      }

      return NextResponse.json(
        { error: result.error || 'Build failed' },
        { status: 500 }
      );
    }

    // Update opportunity with deploy info
    if (supabase && opportunity_id) {
      await supabase
        .from('saas_opportunities')
        .update({
          status: 'deployed',
          repo_url: result.repo_url,
          vercel_url: result.vercel_url,
          deployed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', opportunity_id);
    }

    // Create saas_app entry
    if (supabase) {
      try {
        const domain = `${slug}.chatgenius.pro`;
        await supabase.from('saas_apps').insert({
          slug,
          name: title,
          domain,
          description,
          category,
          color: color || '#8b5cf6',
          status: 'development',
          pricing_model: 'freemium',
          tech_stack: ['next.js', 'supabase', 'stripe', 'tailwindcss'],
          dev_platform: 'claude-code',
          repo_url: result.repo_url,
          live_url: result.vercel_url,
        });
      } catch (err) {
        console.error('[SaaS Build] Failed to create saas_app entry:', err);
      }
    }

    console.log(`[SaaS Build] ✅ Successfully deployed: ${result.vercel_url}`);

    return NextResponse.json({
      success: true,
      repo_url: result.repo_url,
      vercel_url: result.vercel_url,
      message: `${title} er bygget og deployet!`,
    });
  } catch (error) {
    console.error('[SaaS Build] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Build pipeline failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/saas/build
 * Check build status and required environment variables
 */
export async function GET() {
  const envStatus = {
    github: !!process.env.GITHUB_TOKEN,
    vercel: !!process.env.VERCEL_TOKEN,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };

  const ready = envStatus.github && envStatus.vercel && envStatus.anthropic;

  return NextResponse.json({
    ready,
    env_status: envStatus,
    message: ready
      ? 'Auto-build pipeline er klar!'
      : 'Mangler miljøvariabler. Legg til GITHUB_TOKEN, VERCEL_TOKEN og ANTHROPIC_API_KEY i Vercel.',
  });
}
