import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ activeActions: 0, leadsThisWeek: 0, growthRate: 0, cyclesRun: 0 });
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [actionsRes, leadsRes, cyclesRes] = await Promise.all([
      supabase.from('growth_actions').select('id', { count: 'exact' }).in('status', ['planned', 'ready']),
      supabase.from('contacts').select('id', { count: 'exact' }).gte('created_at', weekAgo),
      supabase.from('growth_cycles').select('id', { count: 'exact' }),
    ]);

    return NextResponse.json({
      activeActions: actionsRes.count || 0,
      leadsThisWeek: leadsRes.count || 0,
      growthRate: 0,
      cyclesRun: cyclesRes.count || 0,
    });
  } catch {
    return NextResponse.json({ activeActions: 0, leadsThisWeek: 0, growthRate: 0, cyclesRun: 0 });
  }
}
