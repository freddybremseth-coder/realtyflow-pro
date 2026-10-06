-- Corporate Intelligence Engine v2
-- Account Deep Research + Market/Regulatory Watch + Change Detection.
-- All records are internal seller evidence; no external action is executed.

create table if not exists public.corporate_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.corporate_prospects(id) on delete cascade,
  scope text not null check (scope in ('ACCOUNT','MARKET','REGULATORY')),
  trigger text not null default 'cron' check (trigger in ('cron','manual')),
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCESS','ERROR')),
  provider text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_count integer not null default 0 check (source_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  changed_count integer not null default 0 check (changed_count >= 0),
  warnings jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by_email text
);

create index if not exists corporate_intelligence_runs_account_idx
  on public.corporate_intelligence_runs (prospect_id, scope, started_at desc);
create index if not exists corporate_intelligence_runs_scope_idx
  on public.corporate_intelligence_runs (scope, started_at desc);

create table if not exists public.corporate_intelligence_findings (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.corporate_prospects(id) on delete cascade,
  run_id uuid references public.corporate_intelligence_runs(id) on delete set null,
  scope text not null check (scope in ('ACCOUNT','MARKET','REGULATORY')),
  signal_type text not null,
  title text not null,
  summary text not null,
  why_it_matters text,
  source_url text not null,
  source_title text,
  source_kind text not null default 'web'
    check (source_kind in ('company_web','company_pdf','external_article','official_data','official_regulation','web')),
  source_published_at timestamptz,
  observed_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  fingerprint text not null,
  content_hash text not null,
  change_status text not null default 'NEW'
    check (change_status in ('NEW','CHANGED','UNCHANGED')),
  direction text not null default 'NEUTRAL'
    check (direction in ('POSITIVE','NEUTRAL','NEGATIVE')),
  relevance smallint not null default 50 check (relevance between 0 and 100),
  strength smallint not null default 50 check (strength between 0 and 100),
  freshness smallint not null default 50 check (freshness between 0 and 100),
  source_authority smallint not null default 50 check (source_authority between 0 and 100),
  confidence smallint not null default 50 check (confidence between 0 and 100),
  fit_delta smallint not null default 0 check (fit_delta between -25 and 25),
  timing_delta smallint not null default 0 check (timing_delta between -25 and 25),
  intent_delta smallint not null default 0 check (intent_delta between -25 and 25),
  financial_capacity_delta smallint not null default 0 check (financial_capacity_delta between -25 and 25),
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists corporate_intelligence_findings_identity_idx
  on public.corporate_intelligence_findings (
    coalesce(prospect_id, '00000000-0000-0000-0000-000000000000'::uuid),
    scope,
    fingerprint
  );
create index if not exists corporate_intelligence_findings_account_idx
  on public.corporate_intelligence_findings (prospect_id, last_seen_at desc);
create index if not exists corporate_intelligence_findings_watch_idx
  on public.corporate_intelligence_findings (scope, change_status, last_seen_at desc);
create index if not exists corporate_intelligence_findings_signal_idx
  on public.corporate_intelligence_findings (signal_type, last_seen_at desc);

alter table public.corporate_intelligence_runs enable row level security;
alter table public.corporate_intelligence_findings enable row level security;

revoke all on table public.corporate_intelligence_runs from public, anon, authenticated;
revoke all on table public.corporate_intelligence_findings from public, anon, authenticated;
grant select, insert, update, delete on table public.corporate_intelligence_runs to service_role;
grant select, insert, update, delete on table public.corporate_intelligence_findings to service_role;

comment on table public.corporate_intelligence_runs is
  'Bounded Corporate intelligence research runs. Read/research only; no outreach or pipeline movement.';
comment on table public.corporate_intelligence_findings is
  'Source-backed account, market and regulatory intelligence with change detection and seller-relevance scoring.';
comment on column public.corporate_intelligence_findings.change_status is
  'NEW on first observation, CHANGED when the same source/signal changes materially, otherwise UNCHANGED.';
comment on column public.corporate_intelligence_findings.evidence is
  'Source-derived evidence only. Never use this field for inferred private/sensitive personal data.';
