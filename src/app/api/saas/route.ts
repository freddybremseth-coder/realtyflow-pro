import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/saas
 * List all SaaS apps with optional status filter
 */
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status');
    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json({ apps: [], source: 'not-configured' });
    }

    let query = supabase.from('saas_apps').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('[API /api/saas GET] Supabase query error:', error.message, error.code, error.details);
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: 'Table "saas_apps" does not exist. Run the migration to create it.', apps: [], code: error.code },
          { status: 500 }
        );
      }
      throw error;
    }

    // Get subscription counts per app
    const { data: subCounts } = await supabase
      .from('saas_subscriptions')
      .select('app_id, status')
      .eq('status', 'active');

    const appSubscriptions: Record<string, number> = {};
    (subCounts || []).forEach((sub: any) => {
      appSubscriptions[sub.app_id] = (appSubscriptions[sub.app_id] || 0) + 1;
    });

    const apps = (data || []).map((app: any) => ({
      ...app,
      active_subscriptions: appSubscriptions[app.id] || 0,
    }));

    // Calculate totals
    const totals = {
      totalApps: apps.length,
      liveApps: apps.filter((a: any) => a.status === 'live').length,
      totalUsers: apps.reduce((sum: number, a: any) => sum + (a.total_users || 0), 0),
      totalMRR: apps.reduce((sum: number, a: any) => sum + (a.mrr || 0), 0),
      totalRevenue: apps.reduce((sum: number, a: any) => sum + (a.total_revenue || 0), 0),
    };

    return NextResponse.json({ apps, totals });
  } catch (error) {
    console.error('[API /api/saas GET] Unhandled error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch apps' },
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
      // Update existing
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
    } else {
      // Create new
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
          return NextResponse.json(
            { error: 'Table "saas_apps" does not exist. Run the database migration first.' },
            { status: 500 }
          );
        }
        throw error;
      }
      return NextResponse.json({ app: data }, { status: 201 });
    }
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
