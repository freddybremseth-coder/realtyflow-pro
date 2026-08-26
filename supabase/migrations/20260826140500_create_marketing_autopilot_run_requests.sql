create table if not exists public.marketing_autopilot_run_requests (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  requested_by text,
  brand_ids text[] not null default '{}',
  channels text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','claimed','completed','failed','expired')),
  claimed_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text
);

create index if not exists marketing_autopilot_run_requests_pending_idx
  on public.marketing_autopilot_run_requests(status, requested_at);

alter table public.marketing_autopilot_run_requests enable row level security;

comment on table public.marketing_autopilot_run_requests is
  'One-shot service-role-only requests for Marketing Autopilot immediate execution. No public RLS policies by design.';
