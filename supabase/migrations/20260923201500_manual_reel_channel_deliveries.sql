-- One durable, owner-triggered delivery per Reel/platform. Never retry ambiguous uploads automatically.
create table if not exists public.remaster_reel_deliveries (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.remaster_reel_jobs(id) on delete cascade,
  channel text not null check (channel in ('instagram','youtube')),
  brand_id text not null,
  social_channel_id uuid not null references public.social_channels(id),
  state text not null default 'publishing' check (state in ('publishing','published','needs_review')),
  external_id text,
  external_url text,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reel_id,channel)
);
create index if not exists remaster_reel_deliveries_created_idx on public.remaster_reel_deliveries(created_at desc);
alter table public.remaster_reel_deliveries enable row level security;
revoke all on public.remaster_reel_deliveries from anon, authenticated;
