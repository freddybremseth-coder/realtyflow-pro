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
  cancel_requested_at timestamptz,
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
alter table public.remaster_pipeline_jobs add column if not exists cancel_requested_at timestamptz;
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
  correlation_id uuid,
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
alter table public.remaster_pipeline_job_events add column if not exists correlation_id uuid;
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

create or replace function public.remaster_pipeline_job_status_transition_is_valid(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
as $$
  select p_from = p_to
    or (
      p_from = 'queued'
      and p_to in ('running', 'cancelled')
    )
    or (
      p_from = 'running'
      and p_to in ('waiting_retry', 'completed', 'failed')
    )
    or (
      p_from = 'waiting_retry'
      and p_to in ('queued', 'cancelled')
    )
    or (
      p_from = 'failed'
      and p_to = 'queued'
    );
$$;

create or replace function public.remaster_pipeline_job_step_transition_is_valid(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
as $$
  select array_position(array[
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
  ], p_to) >= array_position(array[
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
  ], p_from);
$$;

create or replace function public.append_remaster_pipeline_job_event(
  p_job_id uuid,
  p_event_type text,
  p_level text default 'info',
  p_status text default null,
  p_pipeline_step text default null,
  p_message text default null,
  p_details jsonb default '{}'::jsonb,
  p_correlation_id uuid default null
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
    details,
    correlation_id
  )
  values (
    p_job_id,
    p_event_type,
    p_level,
    p_status,
    p_pipeline_step,
    p_message,
    coalesce(p_details, '{}'::jsonb),
    p_correlation_id
  )
  returning *;
$$;

create or replace function public.claim_remaster_pipeline_job(
  p_worker_id text,
  p_lease_token uuid default gen_random_uuid(),
  p_lease_seconds integer default 300
)
returns setof public.remaster_pipeline_jobs
language plpgsql
as $$
declare
  v_job public.remaster_pipeline_jobs%rowtype;
begin
  select *
  into v_job
  from public.remaster_pipeline_jobs
  where (
    status = 'queued'
    or (
      status = 'running'
      and lease_expires_at is not null
      and lease_expires_at < now()
    )
  )
    and manual_review_required = false
    and retry_classification not in ('manual_review', 'not_retryable')
    and cancel_requested_at is null
    and not (
      youtube_upload_started_at is not null
      and youtube_video_id is null
    )
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    select *
    into v_job
    from public.remaster_pipeline_jobs
    where status = 'waiting_retry'
      and retry_count < max_retries
      and (next_retry_at is null or next_retry_at <= now())
      and manual_review_required = false
      and retry_classification not in ('manual_review', 'not_retryable')
      and cancel_requested_at is null
      and not (
        youtube_upload_started_at is not null
        and youtube_video_id is null
      )
    order by created_at asc
    for update skip locked
    limit 1;

    if not found then
      return;
    end if;

    update public.remaster_pipeline_jobs jobs
    set
      status = 'queued',
      next_retry_at = null,
      retry_classification = 'unknown'
    where jobs.id = v_job.id
    returning jobs.* into v_job;
  end if;

  return query
  update public.remaster_pipeline_jobs jobs
  set
    status = 'running',
    lease_owner = p_worker_id,
    lease_token = p_lease_token,
    lease_expires_at = now() + make_interval(secs => greatest(1, p_lease_seconds)),
    heartbeat_at = now(),
    started_at = coalesce(jobs.started_at, now()),
    retry_classification = 'unknown',
    manual_review_required = false
  where jobs.id = v_job.id
  returning jobs.*;
end;
$$;

create or replace function public.heartbeat_remaster_pipeline_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 300
)
returns setof public.remaster_pipeline_jobs
language plpgsql
as $$
declare
  v_job public.remaster_pipeline_jobs%rowtype;
begin
  select *
  into v_job
  from public.remaster_pipeline_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception '%', 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status <> 'running' then
    raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
  end if;

  if v_job.lease_token is distinct from p_lease_token then
    raise exception '%', 'LEASE_TOKEN_INVALID' using errcode = 'P0001';
  end if;

  if v_job.lease_expires_at is null or v_job.lease_expires_at <= now() then
    raise exception '%', 'LEASE_EXPIRED' using errcode = 'P0001';
  end if;

  return query
  update public.remaster_pipeline_jobs jobs
  set
    heartbeat_at = now(),
    lease_expires_at = now() + make_interval(secs => greatest(1, p_lease_seconds))
  where jobs.id = p_job_id
  returning jobs.*;
end;
$$;

create or replace function public.transition_remaster_pipeline_job(
  p_job_id uuid,
  p_expected_status text,
  p_next_status text,
  p_pipeline_step text default null,
  p_progress integer default null,
  p_retry_classification text default null,
  p_next_retry_at timestamptz default null,
  p_error_code text default null,
  p_error_message text default null,
  p_lease_token uuid default null,
  p_require_lease boolean default false,
  p_event_type text default 'job_transitioned',
  p_event_message text default null,
  p_event_details jsonb default '{}'::jsonb,
  p_correlation_id uuid default null
)
returns setof public.remaster_pipeline_jobs
language plpgsql
as $$
declare
  v_job public.remaster_pipeline_jobs%rowtype;
begin
  select *
  into v_job
  from public.remaster_pipeline_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception '%', 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status <> p_expected_status then
    raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
  end if;

  if not public.remaster_pipeline_job_status_transition_is_valid(v_job.status, p_next_status) then
    raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
  end if;

  if p_pipeline_step is not null
    and not public.remaster_pipeline_job_step_transition_is_valid(v_job.pipeline_step, p_pipeline_step) then
    raise exception '%', 'INVALID_PIPELINE_STEP_TRANSITION' using errcode = 'P0001';
  end if;

  if p_require_lease then
    if p_lease_token is null or v_job.lease_token is distinct from p_lease_token then
      raise exception '%', 'LEASE_TOKEN_INVALID' using errcode = 'P0001';
    end if;

    if v_job.lease_expires_at is null or v_job.lease_expires_at <= now() then
      raise exception '%', 'LEASE_EXPIRED' using errcode = 'P0001';
    end if;
  end if;

  if p_next_status = 'waiting_retry' then
    if v_job.youtube_upload_started_at is not null and v_job.youtube_video_id is null then
      raise exception '%', 'YOUTUBE_UPLOAD_AMBIGUOUS' using errcode = 'P0001';
    end if;

    if v_job.retry_count >= v_job.max_retries then
      raise exception '%', 'RETRY_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if v_job.status = 'running' and p_next_status = 'cancelled' then
    raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
  end if;

  return query
  with updated as (
    update public.remaster_pipeline_jobs jobs
    set
      status = p_next_status,
      pipeline_step = coalesce(p_pipeline_step, case when p_next_status = 'completed' then 'completed' else jobs.pipeline_step end),
      progress = coalesce(p_progress, case when p_next_status = 'completed' then 100 else jobs.progress end),
      retry_count = case when p_next_status = 'waiting_retry' then jobs.retry_count + 1 else jobs.retry_count end,
      retry_classification = coalesce(
        p_retry_classification,
        case
          when p_next_status = 'waiting_retry' then 'retryable'
          when p_next_status = 'failed' then 'not_retryable'
          else jobs.retry_classification
        end
      ),
      next_retry_at = case when p_next_status = 'waiting_retry' then p_next_retry_at else null end,
      error_code = p_error_code,
      error_message = p_error_message,
      completed_at = case when p_next_status = 'completed' then now() else jobs.completed_at end,
      cancelled_at = case when p_next_status = 'cancelled' then now() else jobs.cancelled_at end,
      lease_token = case when p_next_status in ('waiting_retry', 'completed', 'failed', 'cancelled') then null else jobs.lease_token end,
      lease_owner = case when p_next_status in ('waiting_retry', 'completed', 'failed', 'cancelled') then null else jobs.lease_owner end,
      lease_expires_at = case when p_next_status in ('waiting_retry', 'completed', 'failed', 'cancelled') then null else jobs.lease_expires_at end,
      heartbeat_at = case when p_next_status in ('waiting_retry', 'completed', 'failed', 'cancelled') then null else jobs.heartbeat_at end
    where jobs.id = p_job_id
    returning jobs.*
  ),
  event as (
    insert into public.remaster_pipeline_job_events (
      job_id,
      event_type,
      level,
      status,
      pipeline_step,
      message,
      details,
      correlation_id
    )
    select
      updated.id,
      coalesce(p_event_type, 'job_transitioned'),
      case when p_next_status = 'failed' then 'error' else 'info' end,
      updated.status,
      updated.pipeline_step,
      p_event_message,
      coalesce(p_event_details, '{}'::jsonb),
      p_correlation_id
    from updated
    where p_event_type is not null
    returning id
  )
  select * from updated;
end;
$$;

create or replace function public.mark_remaster_youtube_upload_started(
  p_job_id uuid,
  p_lease_token uuid,
  p_correlation_id uuid default null
)
returns setof public.remaster_pipeline_jobs
language plpgsql
as $$
declare
  v_job public.remaster_pipeline_jobs%rowtype;
begin
  select *
  into v_job
  from public.remaster_pipeline_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception '%', 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status <> 'running' then
    raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
  end if;

  if v_job.lease_token is distinct from p_lease_token then
    raise exception '%', 'LEASE_TOKEN_INVALID' using errcode = 'P0001';
  end if;

  if v_job.lease_expires_at is null or v_job.lease_expires_at <= now() then
    raise exception '%', 'LEASE_EXPIRED' using errcode = 'P0001';
  end if;

  if v_job.cancel_requested_at is not null then
    raise exception '%', 'CANCELLATION_REQUIRES_MANUAL_REVIEW' using errcode = 'P0001';
  end if;

  if v_job.youtube_video_id is not null then
    raise exception '%', 'YOUTUBE_VIDEO_CONFLICT' using errcode = 'P0001';
  end if;

  if v_job.youtube_upload_started_at is not null then
    raise exception '%', 'YOUTUBE_UPLOAD_AMBIGUOUS' using errcode = 'P0001';
  end if;

  if not public.remaster_pipeline_job_step_transition_is_valid(v_job.pipeline_step, 'upload_youtube') then
    raise exception '%', 'INVALID_PIPELINE_STEP_TRANSITION' using errcode = 'P0001';
  end if;

  return query
  with updated as (
    update public.remaster_pipeline_jobs jobs
    set
      pipeline_step = 'upload_youtube',
      youtube_upload_started_at = now()
    where jobs.id = p_job_id
    returning jobs.*
  ),
  event as (
    insert into public.remaster_pipeline_job_events (
      job_id,
      event_type,
      level,
      status,
      pipeline_step,
      message,
      details,
      correlation_id
    )
    select
      updated.id,
      'youtube_upload_started',
      'info',
      updated.status,
      updated.pipeline_step,
      'YouTube upload started',
      '{}'::jsonb,
      p_correlation_id
    from updated
    returning id
  )
  select * from updated;
end;
$$;

create or replace function public.record_remaster_youtube_video(
  p_job_id uuid,
  p_lease_token uuid,
  p_youtube_video_id text,
  p_youtube_url text,
  p_correlation_id uuid default null
)
returns setof public.remaster_pipeline_jobs
language plpgsql
as $$
declare
  v_job public.remaster_pipeline_jobs%rowtype;
begin
  select *
  into v_job
  from public.remaster_pipeline_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception '%', 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status <> 'running' then
    raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
  end if;

  if v_job.lease_token is distinct from p_lease_token then
    raise exception '%', 'LEASE_TOKEN_INVALID' using errcode = 'P0001';
  end if;

  if v_job.lease_expires_at is null or v_job.lease_expires_at <= now() then
    raise exception '%', 'LEASE_EXPIRED' using errcode = 'P0001';
  end if;

  if v_job.youtube_video_id is not null and v_job.youtube_video_id <> p_youtube_video_id then
    raise exception '%', 'YOUTUBE_VIDEO_CONFLICT' using errcode = 'P0001';
  end if;

  if v_job.youtube_upload_started_at is null and v_job.youtube_video_id is null then
    raise exception '%', 'YOUTUBE_UPLOAD_NOT_STARTED' using errcode = 'P0001';
  end if;

  return query
  with updated as (
    update public.remaster_pipeline_jobs jobs
    set
      youtube_video_id = p_youtube_video_id,
      youtube_url = coalesce(jobs.youtube_url, p_youtube_url)
    where jobs.id = p_job_id
    returning jobs.*
  ),
  event as (
    insert into public.remaster_pipeline_job_events (
      job_id,
      event_type,
      level,
      status,
      pipeline_step,
      message,
      details,
      correlation_id
    )
    select
      updated.id,
      'youtube_video_recorded',
      'info',
      updated.status,
      updated.pipeline_step,
      'YouTube video recorded',
      jsonb_build_object('youtubeVideoId', p_youtube_video_id),
      p_correlation_id
    from updated
    returning id
  )
  select * from updated;
end;
$$;

create or replace function public.release_remaster_pipeline_job_lease(
  p_job_id uuid,
  p_lease_token uuid,
  p_correlation_id uuid default null
)
returns setof public.remaster_pipeline_jobs
language plpgsql
as $$
declare
  v_job public.remaster_pipeline_jobs%rowtype;
begin
  select *
  into v_job
  from public.remaster_pipeline_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception '%', 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status <> 'running' then
    raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
  end if;

  if v_job.lease_token is distinct from p_lease_token then
    raise exception '%', 'LEASE_TOKEN_INVALID' using errcode = 'P0001';
  end if;

  if v_job.lease_expires_at is null or v_job.lease_expires_at <= now() then
    raise exception '%', 'LEASE_EXPIRED' using errcode = 'P0001';
  end if;

  return query
  select *
  from public.transition_remaster_pipeline_job(
    p_job_id,
    'running',
    'waiting_retry',
    null,
    null,
    'retryable',
    now(),
    null,
    null,
    p_lease_token,
    true,
    'lease_released',
    'Worker lease released',
    '{}'::jsonb,
    p_correlation_id
  );
end;
$$;

create or replace function public.request_remaster_pipeline_job_cancel(
  p_job_id uuid,
  p_reason text,
  p_correlation_id uuid default null
)
returns setof public.remaster_pipeline_jobs
language plpgsql
as $$
declare
  v_job public.remaster_pipeline_jobs%rowtype;
  v_event_type text;
  v_event_level text;
begin
  select *
  into v_job
  from public.remaster_pipeline_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception '%', 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status in ('completed', 'cancelled') then
    return query select * from public.remaster_pipeline_jobs where id = p_job_id;
    return;
  end if;

  if v_job.youtube_upload_started_at is not null or v_job.youtube_video_id is not null then
    v_event_type := 'cancellation_requires_manual_review';
    v_event_level := 'warn';

    return query
    with updated as (
      update public.remaster_pipeline_jobs jobs
      set
        manual_review_required = true,
        retry_classification = 'manual_review',
        manual_review_reason = coalesce(p_reason, 'Cancellation requested after YouTube side effect.')
      where jobs.id = p_job_id
      returning jobs.*
    ),
    event as (
      insert into public.remaster_pipeline_job_events (
        job_id,
        event_type,
        level,
        status,
        pipeline_step,
        message,
        details,
        correlation_id
      )
      select
        updated.id,
        v_event_type,
        v_event_level,
        updated.status,
        updated.pipeline_step,
        'Cancellation requires manual review',
        jsonb_build_object('code', 'CANCELLATION_REQUIRES_MANUAL_REVIEW'),
        p_correlation_id
      from updated
      returning id
    )
    select * from updated;
    return;
  end if;

  if v_job.status in ('queued', 'waiting_retry') then
    return query
    with updated as (
      update public.remaster_pipeline_jobs jobs
      set
        status = 'cancelled',
        cancelled_at = now(),
        manual_review_reason = p_reason
      where jobs.id = p_job_id
      returning jobs.*
    ),
    event as (
      insert into public.remaster_pipeline_job_events (
        job_id,
        event_type,
        level,
        status,
        pipeline_step,
        message,
        details,
        correlation_id
      )
      select
        updated.id,
        'job_cancelled',
        'info',
        updated.status,
        updated.pipeline_step,
        'Job cancelled before worker side effects',
        '{}'::jsonb,
        p_correlation_id
      from updated
      returning id
    )
    select * from updated;
    return;
  end if;

  if v_job.status = 'running' then
    return query
    with updated as (
      update public.remaster_pipeline_jobs jobs
      set
        cancel_requested_at = coalesce(jobs.cancel_requested_at, now()),
        manual_review_reason = p_reason
      where jobs.id = p_job_id
      returning jobs.*
    ),
    event as (
      insert into public.remaster_pipeline_job_events (
        job_id,
        event_type,
        level,
        status,
        pipeline_step,
        message,
        details,
        correlation_id
      )
      select
        updated.id,
        'cancellation_requested',
        'warn',
        updated.status,
        updated.pipeline_step,
        'Cancellation requested for running job',
        '{}'::jsonb,
        p_correlation_id
      from updated
      returning id
    )
    select * from updated;
    return;
  end if;

  raise exception '%', 'INVALID_JOB_TRANSITION' using errcode = 'P0001';
end;
$$;

comment on table public.remaster_pipeline_jobs is
  'Durable Re-Master video pipeline jobs. Server-only APIs own all writes.';

comment on table public.remaster_pipeline_job_events is
  'Ordered durable Re-Master pipeline job events and safe diagnostics.';

do $$
declare
  v_function regprocedure;
  v_functions regprocedure[] := array[
    'public.append_remaster_pipeline_job_event(uuid, text, text, text, text, text, jsonb, uuid)'::regprocedure,
    'public.claim_remaster_pipeline_job(text, uuid, integer)'::regprocedure,
    'public.heartbeat_remaster_pipeline_job(uuid, uuid, integer)'::regprocedure,
    'public.transition_remaster_pipeline_job(uuid, text, text, text, integer, text, timestamptz, text, text, uuid, boolean, text, text, jsonb, uuid)'::regprocedure,
    'public.mark_remaster_youtube_upload_started(uuid, uuid, uuid)'::regprocedure,
    'public.record_remaster_youtube_video(uuid, uuid, text, text, uuid)'::regprocedure,
    'public.release_remaster_pipeline_job_lease(uuid, uuid, uuid)'::regprocedure,
    'public.request_remaster_pipeline_job_cancel(uuid, text, uuid)'::regprocedure
  ];
begin
  foreach v_function in array v_functions loop
    execute format('revoke execute on function %s from public', v_function);

    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', v_function);
    end if;

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke execute on function %s from authenticated', v_function);
    end if;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', v_function);
    end if;
  end loop;
end $$;
