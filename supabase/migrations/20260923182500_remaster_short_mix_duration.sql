-- Short Mix Studio: preserve legacy 30–180 minute rows/drafts while permitting
-- new 3–30 minute production jobs. API policy, not this compatibility constraint,
-- remains the authority that prevents new >30 minute production starts.
alter table public.remaster_mix_jobs
  drop constraint if exists remaster_mix_jobs_target_minutes_check;

alter table public.remaster_mix_jobs
  add constraint remaster_mix_jobs_target_minutes_check
  check (target_minutes between 3 and 180);
