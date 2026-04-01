import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ contacts: [] });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view'); // 'pipeline' or 'crm'

  let query = supabase.from('contacts').select('*').order('updated_at', { ascending: false });

  if (view === 'pipeline') {
    // Pipeline shows ALL contacts across all stages (full kanban)
    query = query.in('pipeline_status', ['NEW', 'CONTACT', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD']);
  } else if (view === 'crm') {
    // CRM shows contacts that have progressed beyond NEW (table view)
    query = query.in('pipeline_status', ['CONTACT', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'WON', 'CUSTOMER', 'VIP', 'LOST']);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ contacts: [], error: error.message });
  return NextResponse.json({ contacts: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const contact = await request.json();
  const { data, error } = await supabase.from('contacts').upsert(contact).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id, ...updates } = await request.json();
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('contacts').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id } = await request.json();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
