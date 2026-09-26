create table if not exists public.corporate_prospects (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null default 'zeneco' check (brand_id = 'zeneco'),
  company_name text not null,
  organization_number text,
  domain text,
  organization_type text not null default 'company'
    check (organization_type in ('company','association','member_organization','group','other')),
  country_code text not null default 'NO',
  city text,
  industry text,
  employee_count integer check (employee_count is null or employee_count >= 0),
  employee_band text,
  member_count integer check (member_count is null or member_count >= 0),
  website_url text,
  linkedin_company_url text,
  status text not null default 'DISCOVERED'
    check (status in ('DISCOVERED','RESEARCHED','QUALIFIED','CONTACT_READY','CONTACTED','ENGAGED','MEETING','OPPORTUNITY','DISQUALIFIED')),
  fit_score smallint not null default 0 check (fit_score between 0 and 100),
  fit_tier text not null default 'UNSCORED'
    check (fit_tier in ('A','B','C','UNSCORED')),
  fit_reasons text[] not null default '{}',
  evidence_gaps text[] not null default '{}',
  decision_roles text[] not null default '{}',
  source_type text not null default 'manual',
  source_url text,
  evidence jsonb not null default '{}'::jsonb,
  notes text,
  next_action text,
  next_followup timestamptz,
  converted_contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists corporate_prospects_domain_unique
  on public.corporate_prospects (lower(domain))
  where domain is not null and btrim(domain) <> '';

create unique index if not exists corporate_prospects_org_number_unique
  on public.corporate_prospects (organization_number)
  where organization_number is not null and btrim(organization_number) <> '';

create index if not exists corporate_prospects_queue_idx
  on public.corporate_prospects (status, fit_score desc, updated_at desc);

create index if not exists corporate_prospects_followup_idx
  on public.corporate_prospects (next_followup)
  where next_followup is not null;

comment on table public.corporate_prospects is
  'Server-managed Zen Corporate Homes B2B prospect queue. Company-level discovery records stay separate from CRM contacts until explicitly promoted.';

create table if not exists public.corporate_prospect_contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.corporate_prospects(id) on delete cascade,
  name text,
  title text,
  buying_role text,
  seniority text,
  email text,
  phone text,
  linkedin_url text,
  source_url text,
  confidence text check (confidence is null or confidence in ('HIGH','MEDIUM','LOW')),
  status text not null default 'IDENTIFIED'
    check (status in ('IDENTIFIED','VERIFIED','CONTACT_READY','DO_NOT_CONTACT')),
  is_primary boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists corporate_prospect_contacts_email_unique
  on public.corporate_prospect_contacts (prospect_id, lower(email))
  where email is not null and btrim(email) <> '';

create index if not exists corporate_prospect_contacts_prospect_idx
  on public.corporate_prospect_contacts (prospect_id, is_primary desc, updated_at desc);

comment on table public.corporate_prospect_contacts is
  'Optional reviewed decision-maker records for Corporate Homes prospects. Do not populate personal contact data from enrichment providers without explicit approval.';

alter table public.corporate_prospects enable row level security;
alter table public.corporate_prospect_contacts enable row level security;

revoke all on table public.corporate_prospects from public, anon, authenticated;
revoke all on table public.corporate_prospect_contacts from public, anon, authenticated;

grant select, insert, update, delete on table public.corporate_prospects to service_role;
grant select, insert, update, delete on table public.corporate_prospect_contacts to service_role;
