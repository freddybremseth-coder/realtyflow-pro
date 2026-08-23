-- Marketing Growth OS — Phase 7.1: Production Activation.
--
-- brand_context: Brand Brain (én strukturert kontekst per merke; hentes av
-- Director + Creative Generator, ingen brand-hardcoding).
-- marketing_assets: genererte utkast + FULL provenance (forklarbarhet — hvor kom
-- en påstand fra). marketing_lead_forms: konverteringslag koblet til content.
-- Alt deny-direct RLS; skriv via service_role/app-lag.

create table if not exists public.brand_context (
  brand_id          text primary key,
  brand_name        text not null,
  voice             text default '',
  audience          text default '',
  languages         jsonb not null default '["no"]'::jsonb,
  markets           jsonb not null default '[]'::jsonb,
  services          jsonb not null default '[]'::jsonb,
  value_proposition text default '',
  allowed_claims    jsonb not null default '[]'::jsonb,
  forbidden_claims  jsonb not null default '[]'::jsonb,
  preferred_cta     text default '',
  visual_direction  text default '',
  locations         jsonb not null default '[]'::jsonb,
  urls              jsonb not null default '[]'::jsonb,
  contact           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.marketing_assets (
  id                  uuid primary key default gen_random_uuid(),
  creative_variant_id text unique not null,
  content_id          text not null,
  campaign_id         text,
  channel             text,
  genome              jsonb,
  headline            text,
  body                text,
  cta                 text,
  fact_sources        jsonb not null default '[]'::jsonb,
  generated_by        text,
  model               text,
  prompt_version      text,
  learning_rules_used jsonb not null default '[]'::jsonb,
  property_ids        jsonb not null default '[]'::jsonb,
  provenance          jsonb not null default '{}'::jsonb,
  approved_by         text,
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_marketing_assets_content on public.marketing_assets (content_id);

create table if not exists public.marketing_lead_forms (
  form_id     text primary key,
  content_id  text not null,
  campaign_id text,
  brand_id    text,
  channel     text,
  title       text,
  fields      jsonb not null default '[]'::jsonb,
  cta         text,
  utm         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_marketing_lead_forms_content on public.marketing_lead_forms (content_id);

alter table public.brand_context enable row level security;
alter table public.marketing_assets enable row level security;
alter table public.marketing_lead_forms enable row level security;
drop policy if exists "brand_context_deny_direct" on public.brand_context;
create policy "brand_context_deny_direct" on public.brand_context for all to anon, authenticated using (false) with check (false);
drop policy if exists "marketing_assets_deny_direct" on public.marketing_assets;
create policy "marketing_assets_deny_direct" on public.marketing_assets for all to anon, authenticated using (false) with check (false);
drop policy if exists "marketing_lead_forms_deny_direct" on public.marketing_lead_forms;
create policy "marketing_lead_forms_deny_direct" on public.marketing_lead_forms for all to anon, authenticated using (false) with check (false);
