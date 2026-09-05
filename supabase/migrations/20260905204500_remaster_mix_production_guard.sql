-- Production activation guard for Mediterranean Mix Studio.
-- The current Vercel-backed production worker is intentionally limited to
-- 30-minute mixes. Longer plans remain valid drafts while segmented rendering
-- is implemented; they cannot be claimed accidentally by the recovery cron.

create or replace function public.claim_remaster_mix_job(
  p_worker_id text,
  p_lease_seconds integer default 900
)
returns setof public.remaster_mix_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if coalesce(trim(p_worker_id), '') = '' then
    raise exception 'worker id is required';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 1800 then
    raise exception 'lease seconds must be between 60 and 1800';
  end if;

  update public.remaster_mix_jobs
     set status = 'failed',
         pipeline_step = 'failed',
         error_code = 'MIX_LEASE_EXHAUSTED',
         error_message = 'Long-form render exceeded its crash-recovery limit before YouTube upload.',
         lease_owner = null,
         lease_token = null,
         lease_expires_at = null,
         updated_at = now()
   where status = 'running'
     and target_minutes <= 30
     and lease_expires_at is not null
     and lease_expires_at <= now()
     and retry_count >= max_retries
     and youtube_upload_started_at is null
     and youtube_video_id is null;

  select id
    into v_job_id
    from public.remaster_mix_jobs
   where target_minutes <= 30
     and youtube_upload_started_at is null
     and youtube_video_id is null
     and (
       (status = 'queued' and retry_count <= max_retries)
       or (
         status = 'running'
         and lease_expires_at is not null
         and lease_expires_at <= now()
         and retry_count < max_retries
       )
     )
   order by queued_at nulls last, created_at
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  return query
  update public.remaster_mix_jobs jobs
     set status = 'running',
         pipeline_step = 'claim',
         progress = greatest(jobs.progress, 1),
         retry_count = case
           when jobs.status = 'running' then jobs.retry_count + 1
           else jobs.retry_count
         end,
         lease_owner = p_worker_id,
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(),
         started_at = coalesce(jobs.started_at, now()),
         updated_at = now(),
         error_code = null,
         error_message = null
   where jobs.id = v_job_id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_remaster_mix_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_remaster_mix_job(text, integer) to service_role;

comment on function public.claim_remaster_mix_job(text, integer) is
  'Claims only production-enabled Re-Master mix jobs. Current production activation is capped at target_minutes <= 30.';
