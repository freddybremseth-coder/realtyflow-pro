-- Durable Re-Master pipeline job core.
--
-- This migration creates purpose-specific job tables for Re-Master Freddy.
-- It does not touch legacy public.pipeline_runs, songs.status, FFmpeg,
-- YouTube APIs, SSE, cron workers, or production data.

create extension if not exists pgcrypto;

create table if not exists public.remaster_pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'remasterfreddy',
  song_id text not null,
  status text not null default 'queued',
  pipeline_step text not null default 'pending',
  progress integer not null default 0,
  input_version text not null,
  input_config jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  retry_classification text not null default 'unknown',
  next_retry_at timestamptz,
  error_code text,
  error_message text,
  lease_token uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  youtube_upload_started_at timestamptz,
  youtube_video_id text,
  youtube_url text,
  manual_review_required boolean not null default false,
  manual_review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.remaster_pipeline_jobs add column if not exists id uuid default gen_random_uuid();
alter table public.remaster_pipeline_jobs add column if not exists brand text default 'remasterfreddy';
alter table public.remaster_pipeline_jobs add column if not exists song_id text;
alter table public.remaster_pipeline_jobs add column if not exists status text default 'queued';
alter table public.remaster_pipeline_jobs add column if not exists pipeline_step text default 'pending';
alter table public.remaster_pipeline_jobs add column if not exists progress integer default 0;
alter table public.remaster_pipeline_jobs add column if not exists input_version text;
alter table public.remaster_pipeline_jobs add column if not exists input_config jsonb default '{}'::jsonb;
alter table public.remaster_pipeline_jobs add column if not exists idempotency_key text;
alter table public.remaster_pipeline_jobs add column if not exists retry_count integer default 0;
alter table public.remaster_pipeline_jobs add column if not exists max_retries integer default 3;
alter table public.remaster_pipeline_jobs add column if not exists retry_classification text default 'unknown';
alter table public.remaster_pipeline_jobs add column if not exists next_retry_at timestamptz;
alter table public.remaster_pipeline_jobs add column if not exists error_code text;
alter table public.remaster_pipeline_jobs add column if not exists error_message text;
alter table public.remaster_pipeline_jobs add column if not exists lease_token uuid;
alter table public.remaster_pipeline_jobs add column if not exists lease_owner text;
alter table public.remaster_pipeline_jobs add column if not exists lease_expires_at timestamptz;
alter table public.remaster_pipeline_jobs add column if not exists heartbeat_at timestamptz;
alter table public.remaster_pipeline_jobs add column if not exists started_at timestamptz;
alter table public.remaster_pipeline_jobs add column if not exists completed_at timestamptz;
alter table public.remaster_pipeline_jobs add column if not exists cancelled_at timestamptz;
alter table public.remaster_pipeline_jobs add column if not exists youtube_upload_started_at timestamptz;
alter table public.remaster_pipeline_jobs add column if not exists youtube_video_id text;
alter table public.remaster_pipeline_jobs add column if not exists youtube_url text;
alter table public.remaster_pipeline_jobs add column if not exists manual_review_required boolean default false;
alter table public.remaster_pipeline_jobs add column if not exists manual_review_reason text;
alter table public.remaster_pipeline_jobs add column if not exists created_at timestamptz default now();
alter table public.remaster_pipeline_jobs add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_jobs'::regclass
      and contype = 'p'
  )
  and not exists (select 1 from public.remaster_pipeline_jobs where id is null)
  and not exists (
    select 1 from public.remaster_pipeline_jobs group by id having count(*) > 1
  ) then
    alter table public.remaster_pipeline_jobs add constraint remaster_pipeline_jobs_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_jobs'::regclass
      and conname = 'remaster_pipeline_jobs_status_check'
  ) then
    alter table public.remaster_pipeline_jobs
      add constraint remaster_pipeline_jobs_status_check
      check (status in ('queued', 'running', 'waiting_retry', 'completed', 'failed', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_jobs'::regclass
      and conname = 'remaster_pipeline_jobs_step_check'
  ) then
    alter table public.remaster_pipeline_jobs
      add constraint remaster_pipeline_jobs_step_check
      check (pipeline_step in (
        'pending',
        'download_audio',
        'analyze_song',
        'generate_metadata',
        'prepare_images',
        'render_video',
        'compose_thumbnail',
        'upload_youtube',
        'set_thumbnail',
        'add_playlist',
        'persist_results',
        'completed'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_jobs'::regclass
      and conname = 'remaster_pipeline_jobs_retry_classification_check'
  ) then
    alter table public.remaster_pipeline_jobs
      add constraint remaster_pipeline_jobs_retry_classification_check
      check (retry_classification in ('unknown', 'retryable', 'not_retryable', 'manual_review'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_jobs'::regclass
      and conname = 'remaster_pipeline_jobs_progress_check'
  ) then
    alter table public.remaster_pipeline_jobs
      add constraint remaster_pipeline_jobs_progress_check
      check (progress between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_jobs'::regclass
      and conname = 'remaster_pipeline_jobs_retry_count_check'
  ) then
    alter table public.remaster_pipeline_jobs
      add constraint remaster_pipeline_jobs_retry_count_check
      check (retry_count >= 0 and max_retries >= 0 and retry_count <= max_retries);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_jobs'::regclass
      and conname = 'remaster_pipeline_jobs_youtube_url_check'
  ) then
    alter table public.remaster_pipeline_jobs
      add constraint remaster_pipeline_jobs_youtube_url_check
      check (youtube_url is null or youtube_video_id is not null);
  end if;
end $$;

create table if not exists public.remaster_pipeline_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.remaster_pipeline_jobs(id) on delete cascade,
  event_sequence bigint generated always as identity,
  event_type text not null,
  level text not null default 'info',
  status text,
  pipeline_step text,
  message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.remaster_pipeline_job_events add column if not exists id uuid default gen_random_uuid();
alter table public.remaster_pipeline_job_events add column if not exists job_id uuid;
alter table public.remaster_pipeline_job_events add column if not exists event_sequence bigint generated always as identity;
alter table public.remaster_pipeline_job_events add column if not exists event_type text;
alter table public.remaster_pipeline_job_events add column if not exists level text default 'info';
alter table public.remaster_pipeline_job_events add column if not exists status text;
alter table public.remaster_pipeline_job_events add column if not exists pipeline_step text;
alter table public.remaster_pipeline_job_events add column if not exists message text;
alter table public.remaster_pipeline_job_events add column if not exists details jsonb default '{}'::jsonb;
alter table public.remaster_pipeline_job_events add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_job_events'::regclass
      and contype = 'p'
  )
  and not exists (select 1 from public.remaster_pipeline_job_events where id is null)
  and not exists (
    select 1 from public.remaster_pipeline_job_events group by id having count(*) > 1
  ) then
    alter table public.remaster_pipeline_job_events
      add constraint remaster_pipeline_job_events_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_job_events'::regclass
      and conname = 'remaster_pipeline_job_events_job_id_fkey'
  ) then
    alter table public.remaster_pipeline_job_events
      add constraint remaster_pipeline_job_events_job_id_fkey
      foreign key (job_id) references public.remaster_pipeline_jobs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_job_events'::regclass
      and conname = 'remaster_pipeline_job_events_level_check'
  ) then
    alter table public.remaster_pipeline_job_events
      add constraint remaster_pipeline_job_events_level_check
      check (level in ('debug', 'info', 'warn', 'error'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_job_events'::regclass
      and conname = 'remaster_pipeline_job_events_status_check'
  ) then
    alter table public.remaster_pipeline_job_events
      add constraint remaster_pipeline_job_events_status_check
      check (status is null or status in ('queued', 'running', 'waiting_retry', 'completed', 'failed', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.remaster_pipeline_job_events'::regclass
      and conname = 'remaster_pipeline_job_events_step_check'
  ) then
    alter table public.remaster_pipeline_job_events
      add constraint remaster_pipeline_job_events_step_check
      check (pipeline_step is null or pipeline_step in (
        'pending',
        'download_audio',
        'analyze_song',
        'generate_metadata',
        'prepare_images',
        'render_video',
        'compose_thumbnail',
        'upload_youtube',
        'set_thumbnail',
        'add_playlist',
        'persist_results',
        'completed'
      ));
  end if;
end $$;

create unique index if not exists idx_remaster_pipeline_jobs_active_idempotency
  on public.remaster_pipeline_jobs (idempotency_key)
  where status in ('queued', 'running', 'waiting_retry');

create index if not exists idx_remaster_pipeline_jobs_status_created
  on public.remaster_pipeline_jobs (status, created_at);

create index if not exists idx_remaster_pipeline_jobs_brand_song_created
  on public.remaster_pipeline_jobs (brand, song_id, created_at desc);

create index if not exists idx_remaster_pipeline_jobs_lease
  on public.remaster_pipeline_jobs (lease_expires_at)
  where status in ('running', 'waiting_retry');

create index if not exists idx_remaster_pipeline_job_events_job_sequence
  on public.remaster_pipeline_job_events (job_id, event_sequence);

alter table public.remaster_pipeline_jobs enable row level security;
alter table public.remaster_pipeline_job_events enable row level security;

create or replace function public.set_remaster_pipeline_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_remaster_pipeline_jobs_updated_at on public.remaster_pipeline_jobs;
create trigger trg_remaster_pipeline_jobs_updated_at
  before update on public.remaster_pipeline_jobs
  for each row
  execute function public.set_remaster_pipeline_job_updated_at();

create or replace function public.claim_remaster_pipeline_job(
  p_worker_id text,
  p_lease_token uuid default gen_random_uuid(),
  p_lease_seconds integer default 300
)
returns setof public.remaster_pipeline_jobs
language sql
as $$
  with candidate as (
    select id
    from public.remaster_pipeline_jobs
    where (
      status = 'queued'
      or (
        status = 'waiting_retry'
        and retry_count < max_retries
        and (next_retry_at is null or next_retry_at <= now())
      )
      or (
        status = 'running'
        and lease_expires_at is not null
        and lease_expires_at < now()
      )
    )
    and not (
      youtube_upload_started_at is not null
      and youtube_video_id is null
    )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.remaster_pipeline_jobs jobs
  set
    status = 'running',
    lease_owner = p_worker_id,
    lease_token = p_lease_token,
    lease_expires_at = now() + make_interval(secs => greatest(1, p_lease_seconds)),
    heartbeat_at = now(),
    started_at = coalesce(jobs.started_at, now()),
    retry_classification = case
      when jobs.retry_classification = 'manual_review' then jobs.retry_classification
      else 'unknown'
    end,
    manual_review_required = case
      when jobs.retry_classification = 'manual_review' then jobs.manual_review_required
      else false
    end
  where jobs.id in (select id from candidate)
  returning jobs.*;
$$;

create or replace function public.heartbeat_remaster_pipeline_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 300
)
returns setof public.remaster_pipeline_jobs
language sql
as $$
  update public.remaster_pipeline_jobs jobs
  set
    heartbeat_at = now(),
    lease_expires_at = now() + make_interval(secs => greatest(1, p_lease_seconds))
  where jobs.id = p_job_id
    and jobs.lease_token = p_lease_token
    and jobs.status = 'running'
  returning jobs.*;
$$;

create or replace function public.append_remaster_pipeline_job_event(
  p_job_id uuid,
  p_event_type text,
  p_level text default 'info',
  p_status text default null,
  p_pipeline_step text default null,
  p_message text default null,
  p_details jsonb default '{}'::jsonb
)
returns public.remaster_pipeline_job_events
language sql
as $$
  insert into public.remaster_pipeline_job_events (
    job_id,
    event_type,
    level,
    status,
    pipeline_step,
    message,
    details
  )
  values (
    p_job_id,
    p_event_type,
    p_level,
    p_status,
    p_pipeline_step,
    p_message,
    coalesce(p_details, '{}'::jsonb)
  )
  returning *;
$$;

comment on table public.remaster_pipeline_jobs is
  'Durable Re-Master video pipeline jobs. Server-only APIs own all writes.';

comment on table public.remaster_pipeline_job_events is
  'Ordered durable Re-Master pipeline job events and safe diagnostics.';
