-- Re-Master Freddy Mediterranean Mix Studio
-- Durable planning/queue table kept separate from single-song remaster_pipeline_jobs.

create table if not exists public.remaster_mix_jobs (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'remasterfreddy',
  title text not null,
  style text not null,
  target_minutes integer not null default 120,
  crossfade_seconds integer not null default 8,
  playlist_name text not null,
  zenecohomes_enabled boolean not null default true,
  visual_region text not null default 'any',
  visual_type text not null default 'mixed',
  sponsor_interval_minutes integer not null default 20,
  cta_text text,
  track_ids text[] not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  pipeline_step text not null default 'draft',
  progress integer not null default 0,
  youtube_video_id text,
  youtube_url text,
  error_code text,
  error_message text,
  source text not null default 'remaster-admin',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  constraint remaster_mix_jobs_brand_check
    check (brand = 'remasterfreddy'),
  constraint remaster_mix_jobs_style_check
    check (style in (
      'mediterranean-sunset',
      'poolside',
      'luxury-lounge',
      'mediterranean-night',
      'morning-chill'
    )),
  constraint remaster_mix_jobs_target_minutes_check
    check (target_minutes between 30 and 180),
  constraint remaster_mix_jobs_crossfade_seconds_check
    check (crossfade_seconds between 0 and 20),
  constraint remaster_mix_jobs_visual_region_check
    check (visual_region in ('any', 'north', 'south', 'inland', 'costa-calida')),
  constraint remaster_mix_jobs_visual_type_check
    check (visual_type in ('mixed', 'villas', 'apartments', 'pools', 'sea-views', 'interiors')),
  constraint remaster_mix_jobs_sponsor_interval_check
    check (sponsor_interval_minutes between 5 and 60),
  constraint remaster_mix_jobs_track_count_check
    check (cardinality(track_ids) between 2 and 60),
  constraint remaster_mix_jobs_status_check
    check (status in ('draft', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  constraint remaster_mix_jobs_progress_check
    check (progress between 0 and 100)
);

create index if not exists remaster_mix_jobs_status_created_idx
  on public.remaster_mix_jobs (status, created_at desc);

create index if not exists remaster_mix_jobs_created_idx
  on public.remaster_mix_jobs (created_at desc);

alter table public.remaster_mix_jobs enable row level security;

comment on table public.remaster_mix_jobs is
  'Durable long-form Re-Master Freddy mix plans/jobs. Service-role/server API only; no anonymous RLS policy.';

comment on column public.remaster_mix_jobs.input_snapshot is
  'Immutable-at-create planning snapshot of ordered song metadata plus future visual/render settings. Never store credentials or OAuth tokens here.';
