-- Re-Master Mix Studio now intentionally supports shorter production:
-- 3, 5, 10, 15, 20 or 30 minutes from the owner UI. No long-form drafts.
alter table public.remaster_mix_jobs alter column target_minutes set default 30;

alter table public.remaster_mix_jobs
  drop constraint if exists remaster_mix_jobs_target_minutes_check;
alter table public.remaster_mix_jobs
  add constraint remaster_mix_jobs_target_minutes_check
  check (target_minutes between 3 and 30);

alter table public.remaster_mix_jobs
  drop constraint if exists remaster_mix_jobs_track_count_check;
alter table public.remaster_mix_jobs
  add constraint remaster_mix_jobs_track_count_check
  check (cardinality(track_ids) between 1 and 60);

comment on column public.remaster_mix_jobs.target_minutes is
  'Owner-selected production duration in minutes. Supported range is 3–30.';
comment on table public.remaster_mix_jobs is
  'Durable 3–30 minute Re-Master Freddy mix plans/jobs. Service-role/server API only.';
comment on function public.claim_remaster_mix_job(text, integer) is
  'Claims production-enabled Re-Master mix jobs. All valid jobs are 3–30 minutes.';
