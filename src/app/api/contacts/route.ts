import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeStatus(status: unknown) {
  const raw = String(status || '').trim();
  const value = raw
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Æ/g, 'AE')
    .replace(/Ø/g, 'O')
    .replace(/Å/g, 'A')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (['WON', 'VUNNET', 'SOLGT', 'SOLD', 'CLOSED_WON', 'CLOSED', 'COMPLETED', 'CUSTOMER', 'KUNDE', 'VIP'].includes(value)) return 'WON';
  if (['LOST', 'TAPT', 'CLOSED_LOST'].includes(value)) return 'LOST';
  return value || 'NEW';
}

function isCustomerStatus(status: unknown) {
  return normalizeStatus(status) === 'WON';
}

function normalizeContactForClient(contact: any) {
  if (!contact || typeof contact !== 'object') return contact;
  if (!isCustomerStatus(contact.pipeline_status || contact.status || contact.stage)) return contact;
  return {
    ...contact,
    pipeline_status: 'WON',
    sentiment: 100,
    buying_signal_score: 100,
    purchase_signal_score: 100,
  };
}

function normalizeIncomingContact(contact: any) {
  const next = { ...(contact || {}) };
  if (next.status && !next.pipeline_status) next.pipeline_status = next.status;
  if (next.stage && !next.pipeline_status) next.pipeline_status = next.stage;
  next.pipeline_status = normalizeStatus(next.pipeline_status || 'NEW');
  if (isCustomerStatus(next.pipeline_status)) {
    next.pipeline_status = 'WON';
    next.sentiment = 100;
    next.buying_signal_score = 100;
    next.purchase_signal_score = 100;
  }
  return next;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ contacts: [] });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view'); // 'pipeline' or 'crm'

  let query = supabase.from('contacts').select('*').order('updated_at', { ascending: false });

  if (view === 'pipeline') {
    query = query.in('pipeline_status', ['NEW', 'CONTACT', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD', 'CUSTOMER', 'VIP', 'VUNNET', 'SOLGT', 'KUNDE', 'SOLD', 'CLOSED_WON']);
  } else if (view === 'crm') {
    query = query.in('pipeline_status', ['CONTACT', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'WON', 'CUSTOMER', 'VIP', 'LOST', 'VUNNET', 'SOLGT', 'KUNDE', 'SOLD', 'CLOSED_WON']);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ contacts: [], error: error.message });

  const contacts = (data || []).map(normalizeContactForClient);

  // Best effort: if old rows have customer status but old score, repair them in DB too.
  const repairs = contacts
    .filter((c: any) => isCustomerStatus(c.pipeline_status) && (c.sentiment !== 100 || c.buying_signal_score !== 100))
    .map((c: any) => supabase.from('contacts').update({ pipeline_status: 'WON', sentiment: 100, buying_signal_score: 100, purchase_signal_score: 100, updated_at: new Date().toISOString() }).eq('id', c.id));
  if (repairs.length > 0) Promise.allSettled(repairs).catch(() => {});

  return NextResponse.json({ contacts });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const contact = normalizeIncomingContact(await request.json());
  const { data, error } = await supabase.from('contacts').upsert(contact).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: normalizeContactForClient(data) });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id, ...rawUpdates } = await request.json();
  const updates = normalizeIncomingContact(rawUpdates);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('contacts').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: normalizeContactForClient(data) });
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id } = await request.json();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
