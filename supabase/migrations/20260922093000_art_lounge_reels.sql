-- Art Lounge: one durable Reel per Europe/Madrid calendar day. Service-role only.
-- Daily claim and per-channel conditional claims prevent duplicate render/publish.
create table if not exists public.art_lounge_reel_jobs (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null unique,
  state text not null default 'rendering'
    check (state in ('rendering','ready','failed')),
  song_id uuid,
  song_title text,
  artwork jsonb not null default '[]'::jsonb,
  video_path text,
  caption text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.art_lounge_reel_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.art_lounge_reel_jobs(id) on delete cascade,
  channel text not null check (channel in ('facebook','instagram')),
  state text not null default 'reserved'
    check (state in ('reserved','publishing','processing','posted','needs_review','failed')),
  external_id text,
  error text,
  updated_at timestamptz not null default now(),
  unique (job_id,channel)
);
create index if not exists art_lounge_reel_deliveries_queue on public.art_lounge_reel_deliveries(state,updated_at);
alter table public.art_lounge_reel_jobs enable row level security;
alter table public.art_lounge_reel_deliveries enable row level security;
revoke all on public.art_lounge_reel_jobs from anon, authenticated;
revoke all on public.art_lounge_reel_deliveries from anon, authenticated;

-- Supabase Storage public CDN for the already-watermarked, low-res previews video.
-- No anonymous/authenticated write policies; uploads go through protected service API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('art-lounge-reels','art-lounge-reels',true, 62914560, array['video/mp4'])
on conflict (id) do nothing;

-- The ordinary marketing pipeline stays separately configured. This switch is
-- Art Lounge-specific and can be disabled without touching other brands.
create table if not exists public.art_lounge_reel_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  daily_frequency integer not null default 1 check (daily_frequency = 1),
  min_seconds integer not null default 15 check (min_seconds = 15),
  max_seconds integer not null default 35 check (max_seconds = 35),
  automatic boolean not null default true,
  channels text[] not null default array['facebook','instagram']::text[],
  destination_brand text not null default 'freddyb' check (destination_brand = 'freddyb'),
  updated_at timestamptz not null default now()
);
alter table public.art_lounge_reel_settings enable row level security;
revoke all on public.art_lounge_reel_settings from anon, authenticated;
insert into public.art_lounge_reel_settings(singleton, enabled, automatic, channels, destination_brand)
values (true, true, true, array['facebook','instagram'], 'freddyb')
on conflict (singleton) do nothing;

-- Returns true only for the winning concurrent daily worker.
create or replace function public.claim_art_lounge_reel_day(p_date date)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role only'; end if;
  insert into public.art_lounge_reel_jobs(slot_date,state)
  values (p_date,'rendering') on conflict (slot_date) do nothing;
  return found;
end;
$$;
revoke all on function public.claim_art_lounge_reel_day(date) from public, anon, authenticated;
grant execute on function public.claim_art_lounge_reel_day(date) to service_role;
