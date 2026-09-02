-- Book OS controlled production autopilot.
-- Persists durable workflow state while keeping every final approval,
-- distribution handoff and external publication explicitly human-gated.

create table if not exists public.publishing_book_production_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.publishing_book_projects(id) on delete cascade,
  workflow_run_id text unique,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'attention', 'failed', 'cancelled')),
  stage text not null default 'queued',
  current_step integer not null default 0 check (current_step >= 0),
  total_steps integer not null default 3 check (total_steps > 0),
  chapters_completed integer not null default 0 check (chapters_completed >= 0),
  chapters_total integer not null default 0 check (chapters_total >= 0),
  requested_by text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists publishing_book_production_runs_one_active_project
  on public.publishing_book_production_runs(project_id)
  where status in ('queued', 'running');

create index if not exists publishing_book_production_runs_project_created_idx
  on public.publishing_book_production_runs(project_id, created_at desc);

create index if not exists publishing_book_production_runs_status_updated_idx
  on public.publishing_book_production_runs(status, updated_at desc);

alter table public.publishing_book_production_runs enable row level security;
revoke all on table public.publishing_book_production_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.publishing_book_production_runs to service_role;

drop policy if exists "Deny direct API access to Book OS production runs"
  on public.publishing_book_production_runs;
create policy "Deny direct API access to Book OS production runs"
  on public.publishing_book_production_runs
  for all to anon, authenticated
  using (false)
  with check (false);

create or replace function public.publishing_book_production_runs_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.publishing_book_production_runs_set_updated_at()
  from public, anon, authenticated;
grant execute on function public.publishing_book_production_runs_set_updated_at()
  to service_role;

drop trigger if exists publishing_book_production_runs_set_updated_at_trg
  on public.publishing_book_production_runs;
create trigger publishing_book_production_runs_set_updated_at_trg
before update on public.publishing_book_production_runs
for each row execute function public.publishing_book_production_runs_set_updated_at();

-- Trigger functions are invoked by PostgreSQL, not by browser/Data API roles.
-- Remove Supabase's default PUBLIC execute grant from the two Book OS guards.
revoke execute on function public.publishing_guard_learning_origin_production()
  from public, anon, authenticated;
revoke execute on function public.publishing_preserve_book_engine_origin_on_ingest()
  from public, anon, authenticated;
grant execute on function public.publishing_guard_learning_origin_production()
  to service_role;
grant execute on function public.publishing_preserve_book_engine_origin_on_ingest()
  to service_role;

comment on table public.publishing_book_production_runs is
  'Durable controlled-autopilot state for Book Engine production. Completion means ready_for_export, never final approval or external publication.';

notify pgrst, 'reload schema';
