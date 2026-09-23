-- Manual Re-Master Reels Studio: durable 9:16 render jobs created by the owner.
-- Rendering and publishing are separate actions so a good MP4 is never lost because
-- Meta rejects a later external request.
create table if not exists public.remaster_reel_jobs (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('art','books','zeneco')),
  title text not null,
  duration_seconds integer not null check (duration_seconds in (15,20,30,45,60)),
  song_id text not null,
  song_title text,
  region text not null default 'any',
  town text,
  visual_type text not null default 'mixed',
  selection jsonb not null default '{}'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  caption text,
  channels text[] not null default array[]::text[],
  video_path text,
  state text not null default 'rendering'
    check (state in ('rendering','ready','publishing','published','failed','needs_review')),
  publish_results jsonb not null default '{}'::jsonb,
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
values ('remaster-reels','remaster-reels',true,104857600,array['video/mp4'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
