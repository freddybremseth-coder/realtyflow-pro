-- Re-Master Freddy Mediterranean Mix Studio
-- Durable planning/queue table kept separate from single-song remaster_pipeline_jobs.

create table if not exists public.remaster_mix_jobs (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'remasterfreddy',
  title text not null,
  style text not null,
  target_minutes integer not null default 120,
  crossfade_seconds integer not null default 8,
  playlist_name text not null,
  zenecohomes_enabled boolean not null default true,
  visual_region text not null default 'any',
  visual_type text not null default 'mixed',
  sponsor_interval_minutes integer not null default 20,
  cta_text text,
  track_ids text[] not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  pipeline_step text not null default 'draft',
  progress integer not null default 0,
  retry_count integer not null default 0,
  max_retries integer not null default 2,
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  youtube_upload_started_at timestamptz,
  youtube_video_id text,
  youtube_url text,
  error_code text,
  error_message text,
  source text not null default 'remaster-admin',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  constraint remaster_mix_jobs_brand_check
    check (brand = 'remasterfreddy'),
  constraint remaster_mix_jobs_style_check
    check (style in (
      'mediterranean-sunset',
      'poolside',
      'luxury-lounge',
      'mediterranean-night',
      'morning-chill'
    )),
  constraint remaster_mix_jobs_target_minutes_check
    check (target_minutes between 30 and 180),
  constraint remaster_mix_jobs_crossfade_seconds_check
    check (crossfade_seconds between 0 and 20),
  constraint remaster_mix_jobs_visual_region_check
    check (visual_region in ('any', 'north', 'south', 'inland', 'costa-calida')),
  constraint remaster_mix_jobs_visual_type_check
    check (visual_type in ('mixed', 'villas', 'apartments', 'pools', 'sea-views', 'interiors')),
  constraint remaster_mix_jobs_sponsor_interval_check
    check (sponsor_interval_minutes between 5 and 60),
  constraint remaster_mix_jobs_track_count_check
    check (cardinality(track_ids) between 2 and 60),
  constraint remaster_mix_jobs_status_check
    check (status in ('draft', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  constraint remaster_mix_jobs_progress_check
    check (progress between 0 and 100),
  constraint remaster_mix_jobs_retry_count_check
    check (retry_count between 0 and 10),
  constraint remaster_mix_jobs_max_retries_check
    check (max_retries between 0 and 10)
);

create index if not exists remaster_mix_jobs_status_created_idx
  on public.remaster_mix_jobs (status, created_at desc);

create index if not exists remaster_mix_jobs_queue_claim_idx
  on public.remaster_mix_jobs (status, queued_at, created_at)
  where status in ('queued', 'running');

create index if not exists remaster_mix_jobs_created_idx
  on public.remaster_mix_jobs (created_at desc);

alter table public.remaster_mix_jobs enable row level security;

comment on table public.remaster_mix_jobs is
  'Durable long-form Re-Master Freddy mix plans/jobs. Service-role/server API only; no anonymous RLS policy.';

comment on column public.remaster_mix_jobs.input_snapshot is
  'Immutable-at-create planning snapshot of ordered song metadata plus future visual/render settings. Never store credentials or OAuth tokens here.';

-- Claim exactly one queued job. SKIP LOCKED prevents two workers from taking
-- the same long-running render when multiple runners overlap briefly.
create or replace function public.claim_remaster_mix_job(
  p_worker_id text,
  p_lease_seconds integer default 900
)
returns public.remaster_mix_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.remaster_mix_jobs;
begin
  if coalesce(trim(p_worker_id), '') = '' then
    raise exception 'worker id is required';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 1800 then
    raise exception 'lease seconds must be between 60 and 1800';
  end if;

  with candidate as (
    select id
      from public.remaster_mix_jobs
     where status = 'queued'
       and youtube_video_id is null
       and (lease_expires_at is null or lease_expires_at <= now())
     order by queued_at nulls last, created_at
     for update skip locked
     limit 1
  )
  update public.remaster_mix_jobs j
     set status = 'running',
         pipeline_step = 'claim',
         progress = greatest(j.progress, 1),
         lease_owner = p_worker_id,
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(),
         started_at = coalesce(j.started_at, now()),
         updated_at = now(),
         error_code = null,
         error_message = null
    from candidate
   where j.id = candidate.id
  returning j.* into claimed;

  return claimed;
end;
$$;

create or replace function public.heartbeat_remaster_mix_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 900,
  p_pipeline_step text default null,
  p_progress integer default null
)
returns public.remaster_mix_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.remaster_mix_jobs;
begin
  update public.remaster_mix_jobs
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(),
         updated_at = now(),
         pipeline_step = coalesce(nullif(trim(p_pipeline_step), ''), pipeline_step),
         progress = case
           when p_progress is null then progress
           else greatest(progress, least(99, greatest(0, p_progress)))
         end
   where id = p_job_id
     and status = 'running'
     and lease_token = p_lease_token
     and lease_expires_at > now()
  returning * into updated;

  if updated.id is null then
    raise exception 'mix lease is invalid or expired';
  end if;
  return updated;
end;
$$;

create or replace function public.complete_remaster_mix_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_youtube_video_id text,
  p_youtube_url text
)
returns public.remaster_mix_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.remaster_mix_jobs;
begin
  if coalesce(trim(p_youtube_video_id), '') = '' or coalesce(trim(p_youtube_url), '') = '' then
    raise exception 'verified YouTube result is required';
  end if;

  update public.remaster_mix_jobs
     set status = 'completed',
         pipeline_step = 'completed',
         progress = 100,
         youtube_video_id = p_youtube_video_id,
         youtube_url = p_youtube_url,
         completed_at = now(),
         heartbeat_at = now(),
         lease_owner = null,
         lease_token = null,
         lease_expires_at = null,
         updated_at = now(),
         error_code = null,
         error_message = null
   where id = p_job_id
     and status = 'running'
     and lease_token = p_lease_token
     and lease_expires_at > now()
     and youtube_video_id is null
  returning * into updated;

  if updated.id is null then
    raise exception 'mix completion rejected: lease invalid, expired, or upload already recorded';
  end if;
  return updated;
end;
$$;

create or replace function public.fail_remaster_mix_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false
)
returns public.remaster_mix_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  current_job public.remaster_mix_jobs;
  next_status text;
begin
  select * into current_job
    from public.remaster_mix_jobs
   where id = p_job_id
     and status = 'running'
     and lease_token = p_lease_token
     and lease_expires_at > now()
   for update;

  if current_job.id is null then
    raise exception 'mix failure rejected: lease invalid or expired';
  end if;

  next_status := case
    when p_retryable and current_job.retry_count < current_job.max_retries and current_job.youtube_video_id is null
      then 'queued'
    else 'failed'
  end;

  update public.remaster_mix_jobs
     set status = next_status,
         pipeline_step = case when next_status = 'queued' then 'retry_queued' else 'failed' end,
         retry_count = case when next_status = 'queued' then retry_count + 1 else retry_count end,
         queued_at = case when next_status = 'queued' then now() else queued_at end,
         error_code = left(coalesce(p_error_code, 'MIX_WORKER_FAILED'), 120),
         error_message = left(coalesce(p_error_message, 'Long-form mix worker failed'), 2000),
         lease_owner = null,
         lease_token = null,
         lease_expires_at = null,
         heartbeat_at = now(),
         updated_at = now()
   where id = p_job_id
  returning * into current_job;

  return current_job;
end;
$$;

revoke all on function public.claim_remaster_mix_job(text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_remaster_mix_job(uuid, uuid, integer, text, integer) from public, anon, authenticated;
revoke all on function public.complete_remaster_mix_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_remaster_mix_job(uuid, uuid, text, text, boolean) from public, anon, authenticated;

grant execute on function public.claim_remaster_mix_job(text, integer) to service_role;
grant execute on function public.heartbeat_remaster_mix_job(uuid, uuid, integer, text, integer) to service_role;
grant execute on function public.complete_remaster_mix_job(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_remaster_mix_job(uuid, uuid, text, text, boolean) to service_role;
