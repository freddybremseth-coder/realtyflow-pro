-- Extend portfolio Reel jobs to every autonomous brand except the Freddy Bremseth umbrella.
-- freddybremseth stays in the constraint for manual owner-created Reels, but the
-- autonomous scheduler explicitly excludes it.
alter table public.remaster_reel_jobs
  drop constraint if exists remaster_reel_jobs_brand_check;
alter table public.remaster_reel_jobs
  add constraint remaster_reel_jobs_brand_check
  check (brand in (
    'art','books','zeneco','freddybremseth','pinosoecolife','donaanna',
    'chatgenius','freddyai','remasterfreddy'
  ));
