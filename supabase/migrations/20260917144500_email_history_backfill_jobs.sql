-- Durable, service-only historical email backfill state.
create table if not exists public.email_history_backfill_jobs (
  account_id uuid primary key references public.brand_email_configs(id) on delete cascade,
  brand_id text not null,
  enabled boolean not null default false,
  since_days integer not null default 730 check (since_days between 1 and 3650),
  batch_size integer not null default 50 check (batch_size between 1 and 200),
  include_sent boolean not null default true,
  status text not null default 'pending' check (status in ('pending','running','complete','error','paused')),
  total_inserted integer not null default 0,
  total_linked integer not null default 0,
  total_deduped integer not null default 0,
  last_run_at timestamptz,
  completed_at timestamptz,
  last_error text,
  last_batch jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_email_history_backfill_jobs_enabled on public.email_history_backfill_jobs(enabled,status);
alter table public.email_history_backfill_jobs enable row level security;
revoke all on public.email_history_backfill_jobs from anon, authenticated;
