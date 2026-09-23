-- Short Mix Studio: preserve legacy 30–180 minute rows/drafts while permitting
-- new 3–30 minute production jobs. API policy, not this compatibility constraint,
-- remains the authority that prevents new >30 minute production starts.
alter table public.remaster_mix_jobs
  drop constraint if exists remaster_mix_jobs_target_minutes_check;
alter table public.remaster_mix_jobs
  add constraint remaster_mix_jobs_target_minutes_check
  check (target_minutes between 3 and 180);

-- Manual Re-Master Reels Studio jobs. Owner/admin APIs use service role only.
create table if not exists public.remaster_reel_jobs (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('art','books','zeneco')),
  title text not null,
  duration_seconds integer not null check (duration_seconds in (15,20,30,45,60)),
  song_id uuid,
  song_title text,
  channels text[] not null default array['instagram','facebook']::text[],
  selection jsonb not null default '{}'::jsonb,
  state text not null default 'rendering'
    check (state in ('rendering','ready','publishing','published','failed','needs_review')),
  video_path text,
  caption text,
  publications jsonb not null default '{}'::jsonb,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists remaster_reel_jobs_created_idx on public.remaster_reel_jobs(created_at desc);
create index if not exists remaster_reel_jobs_state_idx on public.remaster_reel_jobs(state,updated_at);
alter table public.remaster_reel_jobs enable row level security;
revoke all on public.remaster_reel_jobs from anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('remaster-reels','remaster-reels',true,83886080,array['video/mp4'])
on conflict(id) do update set public=true,file_size_limit=83886080,allowed_mime_types=array['video/mp4'];
