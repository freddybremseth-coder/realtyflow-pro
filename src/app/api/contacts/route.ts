import { NextRequest, NextResponse } from 'next/server';
import { getRequestAccessContext } from '@/lib/api-admin';
import { hasPermission } from '@/lib/access-control';
import { buildRevenueEventDedupeKey, insertRevenueEvent } from '@/lib/revenue/events';
import { getContactsSupabase } from './supabase-client';

async function requireContactsAccess(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) {
    return NextResponse.json(
      { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } },
      { status: 401 },
    );
  }
  const permission = request.method === 'GET' ? 'customers.read' : 'customers.write';
  if (context.role !== 'OWNER' && !hasPermission(context.role, permission)) {
    return NextResponse.json(
      { ok: false, error: { code: 'ACCESS_DENIED', message: 'Access permission required', requiredPermission: permission } },
      { status: 403 },
    );
  }
  return null;
}

function missingDatabaseResponse() {
  return NextResponse.json(
    { ok: false, error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Contacts database is not configured' } },
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

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return '';
  return `${hasPlus ? '+' : ''}${digits}`;
}

function normalizeBrand(value: unknown) {
  return String(value || '').trim().toLowerCase();
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
  if (typeof next.email === 'string') next.email = next.email.trim();
  if (typeof next.phone === 'string') next.phone = next.phone.trim();
  if (isCustomerStatus(next.pipeline_status)) {
    next.pipeline_status = 'WON';
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

function numericOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function findDuplicateContact(supabase: any, contact: any) {
  const incomingEmail = normalizeEmail(contact.email);
  const incomingPhone = normalizePhone(contact.phone);
  const incomingBrand = normalizeBrand(contact.brand_id || contact.brand);
  if (!incomingEmail && !incomingPhone) return null;

  // Deliberately inspect only identity fields. We do not auto-merge data across brands.
  const { data, error } = await supabase
    .from('contacts')
    .select('id,name,email,phone,brand,brand_id,pipeline_status,source,updated_at')
    .limit(1000);
  if (error) return null;

  const candidates = (data || []).filter((candidate: any) => {
    const emailMatch = incomingEmail && normalizeEmail(candidate.email) === incomingEmail;
    const phoneMatch = incomingPhone && normalizePhone(candidate.phone) === incomingPhone;
    return Boolean(emailMatch || phoneMatch);
  });
  if (!candidates.length) return null;

  const sameBrand = candidates.find((candidate: any) => {
    const candidateBrand = normalizeBrand(candidate.brand_id || candidate.brand);
    return incomingBrand && candidateBrand === incomingBrand;
  });

  if (sameBrand) {
    return {
      contact: normalizeContactForClient(sameBrand),
      matchScope: 'same_brand' as const,
      matchType: incomingEmail && normalizeEmail(sameBrand.email) === incomingEmail ? 'email' : 'phone',
    };
  }

  // Cross-brand identity is a warning only. Brand isolation means this must never be silently merged.
  return {
    contact: normalizeContactForClient(candidates[0]),
    matchScope: 'cross_brand' as const,
    matchType: incomingEmail && normalizeEmail(candidates[0].email) === incomingEmail ? 'email' : 'phone',
  };
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
  const unauthorized = await requireContactsAccess(request);
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
  const repairs = contacts
    .filter((c: any) => isCustomerStatus(c.pipeline_status) && (c.buying_signal_score !== 100 || c.purchase_signal_score !== 100 || c.sentiment === 'neutral'))
    .map((c: any) => updateContactWithFallbacks(supabase, c.id, { pipeline_status: 'WON', sentiment: 'hot', buying_signal_score: 100, purchase_signal_score: 100, updated_at: new Date().toISOString() }));
  if (repairs.length > 0) Promise.allSettled(repairs).catch(() => {});
  return NextResponse.json({ contacts });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireContactsAccess(request);
  if (unauthorized) return unauthorized;
  const supabase = getContactsSupabase();
  if (!supabase) return missingDatabaseResponse();
  const contact = normalizeIncomingContact(await request.json());

  const duplicate = await findDuplicateContact(supabase, contact);
  if (duplicate?.matchScope === 'same_brand') {
    return NextResponse.json({
      contact: duplicate.contact,
      duplicate: true,
      duplicateMatch: { scope: duplicate.matchScope, type: duplicate.matchType },
    });
  }
  if (duplicate?.matchScope === 'cross_brand') {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'CROSS_BRAND_CONTACT_MATCH',
          message: 'Samme e-post eller telefon finnes allerede på et annet brand. Velg eksisterende kontakt manuelt eller bekreft korrekt brand før du oppretter en ny.',
        },
        possibleContact: duplicate.contact,
        duplicateMatch: { scope: duplicate.matchScope, type: duplicate.matchType },
      },
      { status: 409 },
    );
  }

  const { data, error } = await insertContactWithFallbacks(supabase, contact);
  if (error) return NextResponse.json({ error: error.message, contact }, { status: 500 });
  return NextResponse.json({ contact: normalizeContactForClient(data), duplicate: false });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireContactsAccess(request);
  if (unauthorized) return unauthorized;
  const supabase = getContactsSupabase();
  if (!supabase) return missingDatabaseResponse();
  const { id, ...rawUpdates } = await request.json();
  const { data: previous } = await supabase
    .from('contacts')
    .select('id,pipeline_status,brand_id,brand')
    .eq('id', id)
    .maybeSingle();
  const updates = normalizeIncomingContact(rawUpdates);
  updates.updated_at = new Date().toISOString();
  const { data, error } = await updateContactWithFallbacks(supabase, id, updates);
  if (error) return NextResponse.json({ error: error.message, updates }, { status: 500 });

  const previousStatus = normalizeStatus(previous?.pipeline_status);
  const nextStatus = normalizeStatus(data?.pipeline_status || updates.pipeline_status);
  const contactId = String(data?.id || id);
  const brandId = String(data?.brand_id || data?.brand || previous?.brand_id || previous?.brand || '').trim();

  if (brandId && previousStatus !== 'QUALIFIED' && nextStatus === 'QUALIFIED') {
    await insertRevenueEvent(supabase, {
      eventType: 'qualified',
      title: 'Lead kvalifisert i CRM',
      contactId,
      brandId,
      sourceSystem: 'crm_pipeline',
      sourceType: 'pipeline_status',
      sourceId: contactId,
      actorType: 'human',
      occurredAt: new Date().toISOString(),
      dedupeKey: buildRevenueEventDedupeKey(['crm-qualified', brandId, contactId]),
      metadata: { previous_status: previousStatus, next_status: nextStatus },
      createdBy: 'api/contacts',
    }).catch(() => undefined);
  }

  if (brandId && previousStatus !== 'WON' && nextStatus === 'WON') {
    const salePrice = numericOrNull(data?.sale_price ?? updates.sale_price ?? data?.pipeline_value ?? updates.pipeline_value);
    const commissionEur = numericOrNull(data?.commission_amount ?? updates.commission_amount);
    await insertRevenueEvent(supabase, {
      eventType: 'deal_won',
      title: 'Salg vunnet i CRM',
      contactId,
      brandId,
      sourceSystem: 'crm_pipeline',
      sourceType: 'pipeline_status',
      sourceId: contactId,
      actorType: 'human',
      revenueImpactEur: salePrice,
      occurredAt: new Date().toISOString(),
      dedupeKey: buildRevenueEventDedupeKey(['crm-won', brandId, contactId]),
      metadata: {
        previous_status: previousStatus,
        next_status: nextStatus,
        sale_price_eur: salePrice,
        commission_eur: commissionEur,
      },
      createdBy: 'api/contacts',
    }).catch(() => undefined);
  }

  return NextResponse.json({ contact: normalizeContactForClient(data) });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireContactsAccess(request);
  if (unauthorized) return unauthorized;
  const supabase = getContactsSupabase();
  if (!supabase) return missingDatabaseResponse();
  const { id } = await request.json();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
