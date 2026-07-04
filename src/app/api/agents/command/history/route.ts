import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { executions: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ executions: [] });

  const { data } = await supabase
    .from('command_executions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ executions: data || [] });
}
