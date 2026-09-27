create table if not exists public.corporate_partner_prospects (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null default 'zeneco' check (brand_id = 'zeneco'),
  company_name text not null,
  organization_number text,
  domain text,
  partner_type text not null
    check (partner_type in ('accounting_tax','legal','management_consulting','hr_recruitment','business_membership','corporate_travel','wealth_advisory','other')),
  country_code text not null default 'NO',
  city text,
  industry text,
  employee_count integer check (employee_count is null or employee_count >= 0),
  website_url text,
  status text not null default 'DISCOVERED'
    check (status in ('DISCOVERED','RESEARCHED','QUALIFIED','CONTACT_READY','CONTACTED','ENGAGED','PARTNER','DISQUALIFIED')),
  fit_score smallint not null default 0 check (fit_score between 0 and 100),
  fit_tier text not null default 'UNSCORED'
    check (fit_tier in ('A','B','C','UNSCORED')),
  fit_reasons text[] not null default '{}',
  evidence_gaps text[] not null default '{}',
  referral_angle text,
  source_type text not null default 'manual',
  source_url text,
  evidence jsonb not null default '{}'::jsonb,
  notes text,
  next_action text,
  next_followup timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists corporate_partner_prospects_org_number_unique
  on public.corporate_partner_prospects (organization_number)
  where organization_number is not null and btrim(organization_number) <> '';

create unique index if not exists corporate_partner_prospects_domain_unique
  on public.corporate_partner_prospects (lower(domain))
  where domain is not null and btrim(domain) <> '';

create index if not exists corporate_partner_prospects_queue_idx
  on public.corporate_partner_prospects (status, fit_score desc, updated_at desc);

comment on table public.corporate_partner_prospects is
  'Server-managed Zen Corporate Homes referral-partner queue. Company-level public-data records only; no personal contact enrichment is implied or authorized.';

alter table public.corporate_partner_prospects enable row level security;
revoke all on table public.corporate_partner_prospects from public, anon, authenticated;
grant select, insert, update, delete on table public.corporate_partner_prospects to service_role;
