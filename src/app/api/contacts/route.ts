import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getContactsSupabase } from './supabase-client';

async function requireContactsAdmin(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get('realtyflow_admin')?.value);
  if (!session?.email) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
      },
      { status: 401 },
    );
  }

  return null;
}

function missingDatabaseResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'DATABASE_NOT_CONFIGURED',
        message: 'Contacts database is not configured',
      },
    },
    { status: 500 },
  );
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
    sentiment: contact.sentiment && String(contact.sentiment).toLowerCase() !== 'neutral' ? contact.sentiment : 'hot',
    buying_signal_score: Number(contact.buying_signal_score || contact.purchase_signal_score || 100),
    purchase_signal_score: Number(contact.purchase_signal_score || contact.buying_signal_score || 100),
  };
}

function normalizeIncomingContact(contact: any) {
  const next = { ...(contact || {}) };
  if (next.status && !next.pipeline_status) next.pipeline_status = next.status;
  if (next.stage && !next.pipeline_status) next.pipeline_status = next.stage;
  next.pipeline_status = normalizeStatus(next.pipeline_status || 'NEW');
  if (isCustomerStatus(next.pipeline_status)) {
    next.pipeline_status = 'WON';
    // contacts.sentiment is a text enum/check in older RealtyFlow databases
    // (hot/warm/neutral/cold). Do not write numeric 100 here; use score columns
    // for numeric buying signal instead.
    next.sentiment = 'hot';
    next.buying_signal_score = 100;
    next.purchase_signal_score = 100;
    if (!next.pipeline_value && next.sale_price) next.pipeline_value = next.sale_price;
  }
  return next;
}

function stripUnknownColumn(payload: any, column?: string) {
  if (!column) return payload;
  const next = { ...payload };
  delete next[column];
  return next;
}

function missingColumnFromError(message = '') {
  const match = message.match(/'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)' column/i);
  return match?.[1] || match?.[2] || match?.[3] || '';
}

async function insertContactWithFallbacks(supabase: any, contact: any) {
  let payload = { ...contact };
  const tried = new Set<string>();

  for (let i = 0; i < 8; i += 1) {
    const { data, error } = await supabase.from('contacts').upsert(payload).select().single();
    if (!error) return { data, error: null };

    const missingColumn = missingColumnFromError(error.message || '');
    if (missingColumn && !tried.has(missingColumn)) {
      tried.add(missingColumn);
      payload = stripUnknownColumn(payload, missingColumn);
      continue;
    }

    // Older contacts schema can have sentiment as text check. If anything still
    // rejects numeric/invalid sentiment, force a valid text value and retry once.
    const message = String(error.message || '').toLowerCase();
    if (!tried.has('sentiment-hot') && message.includes('sentiment')) {
      tried.add('sentiment-hot');
      payload = { ...payload, sentiment: 'hot' };
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: { message: 'Kunne ikke lagre kontakt etter schema-fallbacks' } };
}

async function updateContactWithFallbacks(supabase: any, id: string, updates: any) {
  let payload = { ...updates };
  const tried = new Set<string>();

  for (let i = 0; i < 8; i += 1) {
    const { data, error } = await supabase.from('contacts').update(payload).eq('id', id).select().single();
    if (!error) return { data, error: null };

    const missingColumn = missingColumnFromError(error.message || '');
    if (missingColumn && !tried.has(missingColumn)) {
      tried.add(missingColumn);
      payload = stripUnknownColumn(payload, missingColumn);
      continue;
    }

    const message = String(error.message || '').toLowerCase();
    if (!tried.has('sentiment-hot') && message.includes('sentiment')) {
      tried.add('sentiment-hot');
      payload = { ...payload, sentiment: 'hot' };
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: { message: 'Kunne ikke oppdatere kontakt etter schema-fallbacks' } };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireContactsAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getContactsSupabase();
  if (!supabase) return missingDatabaseResponse();

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

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
    .filter((c: any) => isCustomerStatus(c.pipeline_status) && (c.buying_signal_score !== 100 || c.purchase_signal_score !== 100 || c.sentiment === 'neutral'))
    .map((c: any) => updateContactWithFallbacks(supabase, c.id, { pipeline_status: 'WON', sentiment: 'hot', buying_signal_score: 100, purchase_signal_score: 100, updated_at: new Date().toISOString() }));
  if (repairs.length > 0) Promise.allSettled(repairs).catch(() => {});

  return NextResponse.json({ contacts });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireContactsAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getContactsSupabase();
  if (!supabase) return missingDatabaseResponse();

  const contact = normalizeIncomingContact(await request.json());
  const { data, error } = await insertContactWithFallbacks(supabase, contact);
  if (error) return NextResponse.json({ error: error.message, contact }, { status: 500 });
  return NextResponse.json({ contact: normalizeContactForClient(data) });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireContactsAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getContactsSupabase();
  if (!supabase) return missingDatabaseResponse();

  const { id, ...rawUpdates } = await request.json();
  const updates = normalizeIncomingContact(rawUpdates);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await updateContactWithFallbacks(supabase, id, updates);
  if (error) return NextResponse.json({ error: error.message, updates }, { status: 500 });
  return NextResponse.json({ contact: normalizeContactForClient(data) });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireContactsAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getContactsSupabase();
  if (!supabase) return missingDatabaseResponse();

  const { id } = await request.json();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
