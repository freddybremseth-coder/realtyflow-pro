-- Marketing Growth OS — Phase 4: Revenue Attribution touchpoints.
--
-- Generell touch-modell som lenker kundereisen (impression→click→landing→cta→
-- form_submit→lead_created→qualified→viewing→offer→sale) tilbake til content/
-- campaign. Multi-touch bevares; attribusjonsmodeller (first/last/linear)
-- beregnes i app-laget. dedupe_key + unique constraint = idempotens (samme
-- hendelse attribueres aldri to ganger på retry). revenue_events forblir
-- source-of-truth for downstream utfall.

create table if not exists public.marketing_touchpoints (
  id                  uuid primary key default gen_random_uuid(),
  dedupe_key          text unique not null,
  content_id          text,
  publication_id      text,
  campaign_id         text,
  creative_variant_id text,
  visitor_id          text,
  contact_id          text,
  channel             text,
  touch_type          text not null check (touch_type in (
    'impression','click','landing','cta','form_submit',
    'lead_created','qualified','viewing','offer','sale')),
  confidence          text check (confidence in ('exact','strong','probable','unknown')),
  commission_eur      numeric,
  occurred_at         timestamptz not null default now(),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz default now()
);

create index if not exists idx_mkt_touch_contact on public.marketing_touchpoints (contact_id, occurred_at);
create index if not exists idx_mkt_touch_visitor on public.marketing_touchpoints (visitor_id, occurred_at);
create index if not exists idx_mkt_touch_content on public.marketing_touchpoints (content_id);
create index if not exists idx_mkt_touch_campaign on public.marketing_touchpoints (campaign_id);

alter table public.marketing_touchpoints enable row level security;
drop policy if exists "marketing_touchpoints_deny_direct" on public.marketing_touchpoints;
create policy "marketing_touchpoints_deny_direct" on public.marketing_touchpoints
  for all to anon, authenticated using (false) with check (false);
