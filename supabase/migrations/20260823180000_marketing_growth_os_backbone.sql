-- Marketing Growth OS — Phase 1 (Event Backbone) + Phase 2 (Content Genome).
--
-- marketing_content: genome-register — strukturert metadata per innholdsbit
--   (kanal/format/hook/CTA/mål/pillar/topic/area/språk/audience/property/pris)
--   som gjør at systemet kan LÆRE hvilke kombinasjoner som gir kunder.
-- marketing_events: standardisert hendelsesstrøm (content_created … learning_
--   created) med genome-snapshot, metrics, business_value og revenue-impact.
--   Revenue-relevante hendelser speiles i tillegg til revenue_events.
-- Begge: deny-direct RLS (kun service_role/SECURITY DEFINER skriver).

create table if not exists public.marketing_content (
  content_id  text primary key,
  brand_id    text not null,
  channel     text,
  format      text,
  genome      jsonb not null default '{}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_marketing_content_brand on public.marketing_content (brand_id, created_at desc);

create table if not exists public.marketing_events (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null check (event_type in (
    'content_created','content_approved','content_published','content_viewed',
    'content_clicked','lead_attributed','qualified_lead','experiment_started',
    'experiment_completed','learning_created')),
  brand_id          text not null,
  content_id        text,
  channel           text,
  genome            jsonb,
  metrics           jsonb,
  business_value    numeric not null default 0,
  revenue_impact_eur numeric,
  correlation_id    text,
  occurred_at       timestamptz not null default now(),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz default now()
);
create index if not exists idx_marketing_events_brand on public.marketing_events (brand_id, occurred_at desc);
create index if not exists idx_marketing_events_content on public.marketing_events (content_id);
create index if not exists idx_marketing_events_type on public.marketing_events (event_type, occurred_at desc);

alter table public.marketing_content enable row level security;
alter table public.marketing_events enable row level security;

drop policy if exists "marketing_content_deny_direct" on public.marketing_content;
create policy "marketing_content_deny_direct" on public.marketing_content
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "marketing_events_deny_direct" on public.marketing_events;
create policy "marketing_events_deny_direct" on public.marketing_events
  for all to anon, authenticated using (false) with check (false);
