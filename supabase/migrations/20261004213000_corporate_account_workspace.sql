-- Corporate Account Workspace foundation.
-- Shared strategy/decision-unit/contact-plan data for owner and scoped Zen workspace staff.
-- No automatic outreach or LinkedIn scraping is introduced here.

create table if not exists public.corporate_account_strategies (
  prospect_id uuid primary key references public.corporate_prospects(id) on delete cascade,
  stage text not null default 'TARGET'
    check (stage in (
      'TARGET','RESEARCH','STRATEGY_READY','OUTREACH','ENGAGED','MEETING',
      'BUSINESS_CASE','SHORTLIST','DECISION','NEGOTIATION','WON','LOST'
    )),
  priority text not null default 'P2'
    check (priority in ('P1','P2','P3')),
  account_models text[] not null default '{}',
  objective text,
  entry_angle text,
  first_offer text,
  account_owner_email text,
  strategic_owner_email text,
  estimated_value_eur numeric check (estimated_value_eur is null or estimated_value_eur >= 0),
  target_date date,
  next_review_at timestamptz,
  notes text,
  linkedin_motion text not null default 'MANUAL_APPROVAL'
    check (linkedin_motion in ('OFF','MANUAL_APPROVAL','RELATIONSHIP_ONLY')),
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists corporate_account_strategies_stage_idx
  on public.corporate_account_strategies (stage, priority, next_review_at);

create table if not exists public.corporate_account_touchpoints (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.corporate_prospects(id) on delete cascade,
  contact_id uuid references public.corporate_prospect_contacts(id) on delete set null,
  channel text not null
    check (channel in ('EMAIL','LINKEDIN','CALL','MEETING','OTHER')),
  activity_type text not null,
  status text not null default 'PLANNED'
    check (status in ('PLANNED','COMPLETED','CANCELLED')),
  direction text not null default 'OUTBOUND'
    check (direction in ('OUTBOUND','INBOUND','INTERNAL')),
  owner_email text,
  due_at timestamptz,
  completed_at timestamptz,
  summary text,
  external_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists corporate_account_touchpoints_due_idx
  on public.corporate_account_touchpoints (prospect_id, status, due_at);

create table if not exists public.corporate_account_enrichment (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.corporate_prospects(id) on delete cascade,
  provider text not null,
  data_kind text not null,
  provider_record_id text,
  source_url text,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists corporate_account_enrichment_lookup_idx
  on public.corporate_account_enrichment (prospect_id, provider, data_kind, fetched_at desc);

alter table public.corporate_prospect_contacts
  add column if not exists relationship_status text not null default 'UNKNOWN',
  add column if not exists influence_level text not null default 'UNKNOWN',
  add column if not exists professional_relevance text,
  add column if not exists professional_topics text[] not null default '{}',
  add column if not exists linkedin_following boolean not null default false,
  add column if not exists linkedin_last_touched_at timestamptz;

alter table public.corporate_prospect_contacts
  drop constraint if exists corporate_prospect_contacts_relationship_status_check;
alter table public.corporate_prospect_contacts
  add constraint corporate_prospect_contacts_relationship_status_check
  check (relationship_status in ('UNKNOWN','NOT_CONTACTED','CONNECTED','ENGAGED','CHAMPION','BLOCKED'));

alter table public.corporate_prospect_contacts
  drop constraint if exists corporate_prospect_contacts_influence_level_check;
alter table public.corporate_prospect_contacts
  add constraint corporate_prospect_contacts_influence_level_check
  check (influence_level in ('UNKNOWN','LOW','MEDIUM','HIGH','DECISION_MAKER'));

alter table public.corporate_account_strategies enable row level security;
alter table public.corporate_account_touchpoints enable row level security;
alter table public.corporate_account_enrichment enable row level security;

revoke all on table public.corporate_account_strategies from public, anon, authenticated;
revoke all on table public.corporate_account_touchpoints from public, anon, authenticated;
revoke all on table public.corporate_account_enrichment from public, anon, authenticated;

grant select, insert, update, delete on table public.corporate_account_strategies to service_role;
grant select, insert, update, delete on table public.corporate_account_touchpoints to service_role;
grant select, insert, update, delete on table public.corporate_account_enrichment to service_role;

comment on table public.corporate_account_strategies is
  'Human-governed account-based sales strategy for Zen Corporate Homes. No automatic external execution.';
comment on table public.corporate_account_touchpoints is
  'Planned/completed Corporate account activity across email, LinkedIn, calls and meetings. External actions remain human approved.';
comment on table public.corporate_account_enrichment is
  'Provider-sourced company/professional enrichment evidence such as BRREG or licensed 1881 data. LinkedIn scraping is not permitted.';
comment on column public.corporate_prospect_contacts.professional_topics is
  'Public professional themes only; store with source evidence. Do not infer or store sensitive/private interests.';
