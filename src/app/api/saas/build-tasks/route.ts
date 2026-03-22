import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/saas/build-tasks
 * List queued build tasks, optionally filter by status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'queued_for_build';

    const { data, error } = await supabase
      .from('saas_opportunities')
      .select('*')
      .eq('status', status)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      tasks: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch build tasks' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/saas/build-tasks
 * Update a build task (e.g., mark as building, deployed, or back to approved)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { id, status, repo_url, vercel_url } = await request.json();
    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'building') updates.build_started_at = new Date().toISOString();
    if (status === 'deployed') updates.deployed_at = new Date().toISOString();
    if (repo_url) updates.repo_url = repo_url;
    if (vercel_url) updates.vercel_url = vercel_url;

    const { data, error } = await supabase
      .from('saas_opportunities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, task: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update build task' },
      { status: 500 }
    );
  }
}
