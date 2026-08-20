-- Instagram Growth Intelligence phase 2.
-- Additive only: existing publication and snapshot rows remain valid.

alter table if exists public.engagement_snapshots
  add column if not exists views integer not null default 0,
  add column if not exists saves integer not null default 0,
  add column if not exists total_interactions integer not null default 0,
  add column if not exists media_type text,
  add column if not exists metric_window text not null default 'lifetime';

alter table if exists public.content_publications
  add column if not exists tracking_slug text,
  add column if not exists tracking_url text,
  add column if not exists content_features jsonb not null default '{}'::jsonb,
  add column if not exists performance_goal text,
  add column if not exists source_social_post_id uuid references public.social_posts(id) on delete set null;

create unique index if not exists idx_content_publications_tracking_slug
  on public.content_publications(tracking_slug)
  where tracking_slug is not null;

create index if not exists idx_engagement_snapshots_latest
  on public.engagement_snapshots(publication_id, platform, snapshot_at desc);

create index if not exists idx_content_publications_source_social_post
  on public.content_publications(source_social_post_id)
  where source_social_post_id is not null;

create table if not exists public.social_growth_experiments (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  platform text not null default 'instagram',
  source_publication_id uuid references public.content_publications(id) on delete set null,
  variant_publication_id uuid references public.content_publications(id) on delete set null,
  hypothesis text not null,
  success_metric text not null,
  baseline_value numeric,
  result_value numeric,
  minimum_sample_size integer not null default 5,
  status text not null default 'planned',
  result text,
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_growth_experiments_status_check
    check (status in ('planned', 'running', 'evaluated', 'cancelled')),
  constraint social_growth_experiments_result_check
    check (result is null or result in ('won', 'lost', 'inconclusive', 'needs_more_data'))
);

alter table public.social_growth_experiments enable row level security;
drop policy if exists "Deny direct API access to social growth experiments" on public.social_growth_experiments;
create policy "Deny direct API access to social growth experiments"
  on public.social_growth_experiments for all to anon, authenticated
  using (false) with check (false);

create index if not exists idx_social_growth_experiments_source
  on public.social_growth_experiments(source_publication_id, created_at desc)
  where source_publication_id is not null;
create index if not exists idx_social_growth_experiments_variant
  on public.social_growth_experiments(variant_publication_id)
  where variant_publication_id is not null;
create index if not exists idx_social_growth_experiments_brand_status
  on public.social_growth_experiments(brand_id, status, created_at desc);

revoke all on table public.social_growth_experiments from anon, authenticated;
grant select, insert, update, delete on table public.social_growth_experiments to service_role;

comment on table public.social_growth_experiments is
  'Evidence-backed social content hypotheses and measured outcomes.';
