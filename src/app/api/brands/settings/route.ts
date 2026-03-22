import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - load all brand settings
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ settings: {} });

  const { data } = await supabase.from('brand_settings').select('*');
  // Convert array to object keyed by brand_id
  const settings: Record<string, any> = {};
  (data || []).forEach(row => { settings[row.brand_id] = row.settings; });
  return NextResponse.json({ settings });
}

// POST - save brand settings
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { brand_id, settings } = await request.json();
  const { error } = await supabase.from('brand_settings').upsert(
    { brand_id, settings, updated_at: new Date().toISOString() },
    { onConflict: 'brand_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
