import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { lead_magnets: [] });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ lead_magnets: [] });

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brand') || searchParams.get('brand_id');

  let query = supabase.from('lead_magnets').select('*').order('created_at', { ascending: false });
  if (brandId) query = query.eq('brand', brandId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ lead_magnets: [], error: error.message });
  return NextResponse.json({ lead_magnets: data || [] });
}

export async function PATCH(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id, ...updates } = await request.json();
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('lead_magnets').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead_magnet: data });
}
