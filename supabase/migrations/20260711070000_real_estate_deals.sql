begin;

create table if not exists public.real_estate_deals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  brand_id text not null default 'zeneco',
  title text not null default 'Boligkjøp i Spania',
  stage text not null default 'QUALIFIED',
  status text not null default 'ACTIVE',
  property_refs text[] not null default '{}'::text[],
  preferred_property_ref text,
  decision_makers jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  next_customer_decision text,
  next_action text,
  next_action_due_at timestamptz,
  expected_closing_date date,
  probability integer not null default 20,
  risk_level text not null default 'MEDIUM',
  risk_reason text,
  financing_status text not null default 'UNKNOWN',
  legal_status text not null default 'NOT_STARTED',
  reservation_status text not null default 'NOT_STARTED',
  estimated_purchase_price numeric(14,2),
  expected_commission numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint real_estate_deals_stage_check check (stage in (
    'QUALIFIED',
    'CONSULTATION_BOOKED',
    'REQUIREMENTS_CONFIRMED',
    'SHORTLIST_APPROVED',
    'VIEWING_PLANNED',
    'VIEWING_COMPLETED',
    'PREFERRED_PROPERTY',
    'OFFER_RESERVATION',
    'LEGAL_DUE_DILIGENCE',
    'CONTRACT_SIGNED',
    'COMPLETED'
  )),
  constraint real_estate_deals_status_check check (status in ('ACTIVE', 'ON_HOLD', 'WON', 'LOST')),
  constraint real_estate_deals_probability_check check (probability between 0 and 100),
  constraint real_estate_deals_risk_level_check check (risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

create index if not exists real_estate_deals_contact_idx
  on public.real_estate_deals(contact_id);

create index if not exists real_estate_deals_active_stage_idx
  on public.real_estate_deals(status, stage, updated_at desc);

create index if not exists real_estate_deals_next_action_idx
  on public.real_estate_deals(next_action_due_at)
  where status in ('ACTIVE', 'ON_HOLD');

create index if not exists real_estate_deals_expected_close_idx
  on public.real_estate_deals(expected_closing_date)
  where status in ('ACTIVE', 'ON_HOLD');

alter table public.real_estate_deals enable row level security;

revoke all on table public.real_estate_deals from anon, authenticated;
grant select, insert, update, delete on table public.real_estate_deals to service_role;

comment on table public.real_estate_deals is
  'Human-controlled closing workspace for real-estate buyer opportunities. No public client access.';

commit;
