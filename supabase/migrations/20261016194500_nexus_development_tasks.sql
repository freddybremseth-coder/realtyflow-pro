-- Owner-only AI development requests. Service-role access is gated in application API.
create table if not exists public.nexus_development_tasks (
  id uuid primary key default gen_random_uuid(),
  request_text text not null check (char_length(request_text) between 1 and 5000),
  scope text not null check (scope in ('bug','feature','content','access','deployment','investigation')),
  brand_key text,
  source_path text,
  requested_by text not null,
  status text not null default 'requested' check (status in ('requested','triaging','needs_approval','in_progress','in_review','verified','deployed','blocked')),
  execution_authorized boolean not null default false check (execution_authorized = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nexus_development_tasks_requested_by_created
  on public.nexus_development_tasks(requested_by, created_at desc);
alter table public.nexus_development_tasks enable row level security;
revoke all on public.nexus_development_tasks from anon, authenticated;
-- Do not create permissive RLS policies: requests are mediated by the
-- authenticated, owner-only server endpoint with service-role credentials.
