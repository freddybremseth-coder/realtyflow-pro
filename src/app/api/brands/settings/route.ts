import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - load all brand settings
export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { settings: {} });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ settings: {} });

  const { data } = await supabase.from('brand_settings').select('*');
  // Convert array to object keyed by brand_id
  const settings: Record<string, any> = {};
  (data || []).forEach(row => { settings[row.brand_id] = row.settings; });
  return NextResponse.json({ settings });
}

// POST - save brand settings (or rename brand)
export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const body = await request.json();
  const { brand_id, settings, action, new_name } = body;

  // Rename brand action
  if (action === 'rename' && brand_id && new_name) {
    const { error } = await supabase.from('brand_settings').upsert(
      {
        brand_id,
        settings: { ...(settings || {}), custom_name: new_name },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: `Brand renamed to ${new_name}` });
  }

  // Delete brand action
  if (action === 'delete' && brand_id) {
    const { error } = await supabase.from('brand_settings').upsert(
      {
        brand_id,
        settings: { ...(settings || {}), deleted: true },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: 'Brand marked as deleted' });
  }

  // Normal settings save
  const { error } = await supabase.from('brand_settings').upsert(
    { brand_id, settings, updated_at: new Date().toISOString() },
    { onConflict: 'brand_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
