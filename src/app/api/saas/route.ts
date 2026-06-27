import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ARCHIVED_SAAS_APP_SLUGS, SAAS_PORTFOLIO_APPS, sortSaasPortfolio } from '@/lib/saas-portfolio';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function fallbackApps() {
  return SAAS_PORTFOLIO_APPS.map((app, index) => ({
    id: app.slug,
    ...app,
    active_subscriptions: 0,
    total_users: 0,
    active_users_30d: 0,
    total_revenue: app.slug === 'demosites' ? 0 : 0,
    mrr: 0,
    arr: 0,
    portfolio_order: index,
  }));
}

function calculateTotals(apps: any[]) {
  return {
    totalApps: apps.length,
    liveApps: apps.filter((a: any) => a.status === 'live').length,
    totalUsers: apps.reduce((sum: number, a: any) => sum + Number(a.total_users || a.active_users_30d || a.active_subscriptions || 0), 0),
    totalMRR: apps.reduce((sum: number, a: any) => sum + Number(a.mrr || 0), 0),
    totalRevenue: apps.reduce((sum: number, a: any) => sum + Number(a.total_revenue || 0), 0),
  };
}

async function syncPortfolioApps(supabase: ReturnType<typeof createClient>) {
  for (const app of SAAS_PORTFOLIO_APPS) {
    const payload = {
      ...app,
      updated_at: new Date().toISOString(),
    };

    const existing = await supabase.from('saas_apps').select('id').eq('slug', app.slug).maybeSingle();
    if (existing.data?.id) {
      await supabase.from('saas_apps').update(payload).eq('id', existing.data.id);
    } else {
      await supabase.from('saas_apps').insert(payload);
    }
  }

  await supabase
    .from('saas_apps')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .in('slug', [...ARCHIVED_SAAS_APP_SLUGS]);
}

/**
 * GET /api/saas
 * List SaaS apps. The main portfolio is kept aligned with ChatGenius public demos:
 * Astro, Family, VM2026, RealtyFlow, Spanish and DemoSites.
 */
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status');
    const includeArchived = request.nextUrl.searchParams.get('includeArchived') === 'true';
    const supabase = getSupabase();

    if (!supabase) {
      const apps = status ? fallbackApps().filter((app) => app.status === status) : fallbackApps();
      return NextResponse.json({ apps, totals: calculateTotals(apps), source: 'fallback' });
    }

    await syncPortfolioApps(supabase);

    let query = supabase.from('saas_apps').select('*');
    if (status) query = query.eq('status', status);
    if (!includeArchived) query = query.neq('status', 'archived');

    const { data, error } = await query;
    if (error) {
      console.error('[API /api/saas GET] Supabase query error:', error.message, error.code, error.details);
      if (error.code === '42P01') {
        const apps = fallbackApps();
        return NextResponse.json({ apps, totals: calculateTotals(apps), source: 'fallback-missing-table' });
      }
      throw error;
    }

    const { data: subCounts } = await supabase
      .from('saas_subscriptions')
      .select('app_id, status')
      .eq('status', 'active');

    const appSubscriptions: Record<string, number> = {};
    (subCounts || []).forEach((sub: any) => {
      appSubscriptions[sub.app_id] = (appSubscriptions[sub.app_id] || 0) + 1;
    });

    const apps = sortSaasPortfolio(
      (data || []).map((app: any) => ({
        ...app,
        active_subscriptions: appSubscriptions[app.id] || 0,
      })),
    );

    return NextResponse.json({ apps, totals: calculateTotals(apps), source: 'supabase' });
  } catch (error) {
    console.error('[API /api/saas GET] Unhandled error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch apps', apps: fallbackApps(), totals: calculateTotals(fallbackApps()) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/saas
 * Create or update a SaaS app
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const { id, ...fields } = body;

    if (id) {
      const { data, error } = await supabase
        .from('saas_apps')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        console.error('[API /api/saas POST] Update error:', error.message, error.code, error.details);
        throw error;
      }
      return NextResponse.json({ app: data });
    }

    if (!fields.slug || !fields.name) {
      return NextResponse.json({ error: 'slug and name are required' }, { status: 400 });
    }

    fields.domain = fields.domain || `${fields.slug}.chatgenius.pro`;
    const { data, error } = await supabase
      .from('saas_apps')
      .insert(fields)
      .select()
      .single();
    if (error) {
      console.error('[API /api/saas POST] Insert error:', error.message, error.code, error.details);
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Table "saas_apps" does not exist. Run the database migration first.' }, { status: 500 });
      }
      throw error;
    }
    return NextResponse.json({ app: data }, { status: 201 });
  } catch (error) {
    console.error('[API /api/saas POST] Unhandled error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save app' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/saas
 * Delete a SaaS app by id
 */
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

    const { error } = await supabase.from('saas_apps').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete' },
      { status: 500 }
    );
  }
}
