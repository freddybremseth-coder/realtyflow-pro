-- Expand the existing manual Reels job brand constraint without changing job state or history.
alter table public.remaster_reel_jobs
  drop constraint if exists remaster_reel_jobs_brand_check;
alter table public.remaster_reel_jobs
  add constraint remaster_reel_jobs_brand_check
  check (brand in ('art','books','zeneco','freddybremseth','pinosoecolife','donaanna'));
