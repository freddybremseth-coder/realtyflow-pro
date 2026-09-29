create table public.property_content_opportunities (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  signature text not null,
  opportunity_type text not null check (opportunity_type in ('same_price_area_gap','cross_area_same_budget','property_type_tradeoff')),
  score integer not null check (score between 0 and 100),
  title text not null check (length(title) between 1 and 220),
  summary text not null default '' check (length(summary) <= 1200),
  editorial_angle text not null default '' check (length(editorial_angle) <= 2400),
  primary_keyword text,
  supporting_keywords text[] not null default '{}'::text[],
  audience text,
  property_refs text[] not null default '{}'::text[],
  property_ids uuid[] not null default '{}'::uuid[],
  image_url text,
  evidence jsonb not null default '{}'::jsonb,
  draft_markdown text not null default '' check (length(draft_markdown) <= 60000),
  status text not null default 'suggested' check (status in ('suggested','drafted','dismissed','expired')),
  draft_id uuid references core.brand_workspace_content_drafts(id) on delete set null,
  detected_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '21 days'),
  drafted_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, signature)
);

alter table public.property_content_opportunities enable row level security;
revoke all on public.property_content_opportunities from public, anon, authenticated;
grant select, insert, update on public.property_content_opportunities to service_role;

create index property_content_opportunities_active_idx
  on public.property_content_opportunities (brand_id, status, score desc, detected_at desc);
create index property_content_opportunities_expiry_idx
  on public.property_content_opportunities (brand_id, expires_at)
  where status = 'suggested';
create index property_content_opportunities_refs_gin
  on public.property_content_opportunities using gin (property_refs);

comment on table public.property_content_opportunities is
  'Service-only Nexus editorial signal queue. Stores evidence-backed property comparison opportunities; suggested/drafted never implies external publication.';
