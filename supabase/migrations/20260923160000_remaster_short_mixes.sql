-- Mix Studio supports 3–30 minute short renders while preserving saved 30–180 minute plans.
alter table public.remaster_mix_jobs
  drop constraint if exists remaster_mix_jobs_target_minutes_check;
alter table public.remaster_mix_jobs
  add constraint remaster_mix_jobs_target_minutes_check
  check (target_minutes >= 3 and target_minutes <= 180);
