-- RealtyFlow Book Distribution Control Plane v1
-- Canonical server-only state for channel readiness, publication plans and
-- auditable delivery jobs. Credentials are never stored here; secret_ref may
-- only point to an external secret manager or Supabase Vault entry.

create table if not exists public.publishing_channel_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null default 'freddypublishing',
  channel text not null check (channel in (
    'amazon_kdp', 'apple_books', 'google_play_books',
    'kobo_writing_life', 'publishdrive', 'direct_store'
  )),
  external_account_id text not null default 'default',
  account_label text,
  connector_type text not null,
  status text not null default 'disconnected' check (status in (
    'disconnected', 'pending', 'connected', 'degraded', 'error'
  )),
  secret_ref text,
  capabilities jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  last_health_check_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishing_channel_connections_unique_account
    unique (brand_id, channel, external_account_id)
);

comment on table public.publishing_channel_connections is
  'RealtyFlow Book Distribution Control Plane v1';
comment on column public.publishing_channel_connections.secret_ref is
  'Opaque secret-manager/Vault reference only. Never store provider credentials or tokens in this table.';

create table if not exists public.publishing_distribution_publications (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null default 'freddypublishing',
  project_id uuid not null references public.publishing_book_projects(id) on delete cascade,
  book_id uuid references public.publishing_books(id) on delete set null,
  channel text not null check (channel in (
    'amazon_kdp', 'apple_books', 'google_play_books',
    'kobo_writing_life', 'publishdrive', 'direct_store'
  )),
  marketplace text not null default 'global',
  external_id text,
  external_url text,
  status text not null default 'prepared' check (status in (
    'prepared', 'blocked', 'awaiting_approval', 'approved',
    'submitted', 'published', 'failed', 'paused'
  )),
  metadata_payload jsonb not null default '{}'::jsonb,
  artifact_manifest jsonb not null default '{}'::jsonb,
  preflight jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  submitted_at timestamptz,
  published_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishing_distribution_publications_unique_target
    unique (project_id, channel, marketplace)
);

comment on table public.publishing_distribution_publications is
  'RealtyFlow Book Distribution Control Plane v1';

create table if not exists public.publishing_distribution_jobs (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publishing_distribution_publications(id) on delete cascade,
  action text not null check (action in (
    'prepare', 'submit', 'update_metadata', 'update_price',
    'sync_status', 'pull_sales'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'preparing', 'awaiting_approval', 'approved', 'running',
    'awaiting_manual_completion', 'succeeded', 'blocked', 'failed', 'cancelled'
  )),
  idempotency_key text not null unique,
  requested_by text not null,
  approved_by text,
  approved_at timestamptz,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  run_after timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishing_distribution_jobs_approval_consistent check (
    (approved_at is null and approved_by is null)
    or (approved_at is not null and approved_by is not null)
  )
);

comment on table public.publishing_distribution_jobs is
  'RealtyFlow Book Distribution Control Plane v1';

create index if not exists idx_publishing_channel_connections_brand_status
  on public.publishing_channel_connections (brand_id, status, channel);
create index if not exists idx_publishing_distribution_publications_brand_status
  on public.publishing_distribution_publications (brand_id, status, updated_at desc);
create index if not exists idx_publishing_distribution_publications_book
  on public.publishing_distribution_publications (book_id) where book_id is not null;
create index if not exists idx_publishing_distribution_jobs_publication_status
  on public.publishing_distribution_jobs (publication_id, status, created_at desc);
create index if not exists idx_publishing_distribution_jobs_queue
  on public.publishing_distribution_jobs (status, run_after, created_at)
  where status in ('queued', 'approved');

alter table public.publishing_channel_connections enable row level security;
alter table public.publishing_distribution_publications enable row level security;
alter table public.publishing_distribution_jobs enable row level security;

revoke all on table public.publishing_channel_connections from public, anon, authenticated;
revoke all on table public.publishing_distribution_publications from public, anon, authenticated;
revoke all on table public.publishing_distribution_jobs from public, anon, authenticated;

grant select, insert, update, delete on table public.publishing_channel_connections to service_role;
grant select, insert, update, delete on table public.publishing_distribution_publications to service_role;
grant select, insert, update, delete on table public.publishing_distribution_jobs to service_role;

drop policy if exists "publishing_channel_connections_deny_direct" on public.publishing_channel_connections;
create policy "publishing_channel_connections_deny_direct"
  on public.publishing_channel_connections for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "publishing_distribution_publications_deny_direct" on public.publishing_distribution_publications;
create policy "publishing_distribution_publications_deny_direct"
  on public.publishing_distribution_publications for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "publishing_distribution_jobs_deny_direct" on public.publishing_distribution_jobs;
create policy "publishing_distribution_jobs_deny_direct"
  on public.publishing_distribution_jobs for all to anon, authenticated
  using (false) with check (false);

create or replace function public.publishing_distribution_transition_job(
  p_job_id uuid,
  p_action text,
  p_actor text,
  p_external_id text default null,
  p_external_url text default null,
  p_output jsonb default '{}'::jsonb
)
returns table (job_status text, publication_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publishing_distribution_jobs%rowtype;
  v_publication public.publishing_distribution_publications%rowtype;
  v_now timestamptz := now();
begin
  select * into v_job
  from public.publishing_distribution_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Distribution job not found' using errcode = 'P0002';
  end if;

  select * into v_publication
  from public.publishing_distribution_publications
  where id = v_job.publication_id
  for update;
  if not found then
    raise exception 'Distribution publication not found' using errcode = 'P0002';
  end if;

  if p_action = 'approve' then
    if v_job.status <> 'awaiting_approval' then
      raise exception 'Job must be awaiting approval, current status: %', v_job.status using errcode = 'P0001';
    end if;
    update public.publishing_distribution_jobs
      set status = 'approved', approved_by = p_actor, approved_at = v_now,
          output = coalesce(output, '{}'::jsonb) || coalesce(p_output, '{}'::jsonb), updated_at = v_now
      where id = p_job_id;
    update public.publishing_distribution_publications
      set status = 'approved', updated_at = v_now
      where id = v_publication.id;
  elsif p_action = 'handoff' then
    if v_job.status <> 'approved' then
      raise exception 'Job must be approved, current status: %', v_job.status using errcode = 'P0001';
    end if;
    update public.publishing_distribution_jobs
      set status = 'awaiting_manual_completion',
          output = coalesce(output, '{}'::jsonb) || coalesce(p_output, '{}'::jsonb), updated_at = v_now
      where id = p_job_id;
  elsif p_action = 'complete' then
    if v_job.status <> 'awaiting_manual_completion' then
      raise exception 'Job must await manual completion, current status: %', v_job.status using errcode = 'P0001';
    end if;
    update public.publishing_distribution_jobs
      set status = 'succeeded',
          output = coalesce(output, '{}'::jsonb) || coalesce(p_output, '{}'::jsonb),
          finished_at = v_now, updated_at = v_now
      where id = p_job_id;
    update public.publishing_distribution_publications
      set status = 'published', external_id = p_external_id, external_url = p_external_url,
          published_at = v_now, last_synced_at = v_now, updated_at = v_now
      where id = v_publication.id;
  else
    raise exception 'Unsupported distribution action: %', p_action using errcode = '22023';
  end if;

  return query
    select jobs.status, publications.status
    from public.publishing_distribution_jobs jobs
    join public.publishing_distribution_publications publications on publications.id = jobs.publication_id
    where jobs.id = p_job_id;
end;
$$;

revoke execute on function public.publishing_distribution_transition_job(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.publishing_distribution_transition_job(uuid, text, text, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
