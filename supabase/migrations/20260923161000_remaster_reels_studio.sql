-- Owner-generated Reels Studio exports. Does not modify the autonomous ART daily reel pipeline.
-- Media is a PUBLIC watermarked promotional MP4 for browser playback/Meta ingestion;
-- only service-role may create, update or delete objects and job records.
create table if not exists public.remaster_studio_reel_jobs (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  brand text not null check(brand in ('art','books','zeneco','pinoso')),
  title text not null,
  area text,
  duration_seconds integer not null check(duration_seconds in (15,20,30,45,60)),
  channels text[] not null default array['instagram','facebook']::text[],
  song_id uuid not null,
  song_title text not null,
  visual_items jsonb not null default '[]'::jsonb,
  caption text not null default '',
  state text not null default 'rendering' check(state in ('rendering','ready','failed')),
  video_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remaster_studio_reel_channels_check
    check(channels <@ array['instagram','facebook']::text[] and cardinality(channels)>=1)
);
create index if not exists remaster_studio_reel_jobs_recent
  on public.remaster_studio_reel_jobs(created_at desc);
alter table public.remaster_studio_reel_jobs enable row level security;
revoke all on public.remaster_studio_reel_jobs from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('remaster-studio-reels','remaster-studio-reels',true,94371840,array['video/mp4'])
on conflict(id) do nothing;
