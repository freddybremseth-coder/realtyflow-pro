create table public.property_content_learning_snapshots (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.property_content_opportunities(id) on delete cascade,
  brand_id text not null,
  publication_id uuid references public.content_publications(id) on delete set null,
  opportunity_type text not null,
  article_title text not null default '',
  article_path text not null,
  window_days integer not null check (window_days between 1 and 30),
  age_days integer not null default 0 check (age_days >= 0),
  search_arrivals integer not null default 0 check (search_arrivals >= 0),
  touchpoints integer not null default 0 check (touchpoints >= 0),
  lead_touchpoints integer not null default 0 check (lead_touchpoints >= 0),
  publication_views integer not null default 0 check (publication_views >= 0),
  evidence_level text not null check (evidence_level in ('insufficient','emerging','measured')),
  learning_note text not null default '' check (length(learning_note) <= 1200),
  evidence jsonb not null default '{}'::jsonb,
  observed_on date not null default current_date,
  observed_at timestamptz not null default now(),
  unique (opportunity_id, observed_on)
);
alter table public.property_content_learning_snapshots enable row level security;
revoke all on public.property_content_learning_snapshots from public, anon, authenticated;
grant select, insert, update on public.property_content_learning_snapshots to service_role;
create index property_content_learning_brand_observed_idx
  on public.property_content_learning_snapshots (brand_id, observed_at desc);
create index property_content_learning_angle_level_idx
  on public.property_content_learning_snapshots (brand_id, opportunity_type, evidence_level, observed_at desc);
comment on table public.property_content_learning_snapshots is
  'Service-only observe-first evidence snapshots for published Nexus editorial signals. This table does not authorize automatic strategy or scoring changes.';
