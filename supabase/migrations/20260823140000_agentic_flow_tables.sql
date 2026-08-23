-- Agentic Core — støtte-tabeller for lead-intake prod-flyten.
-- agentic_drafts: utkast fra create_draft (sendes aldri automatisk).
-- agentic_buyer_profiles: agentic buyer-profile-lager (idempotent). LI-native
--   persistens kobles på rute-nivå via createViaLeadIntelligence-seam senere.
-- Begge har operasjons-scoped idempotency_key (unik) og deny-direct RLS
--   (kun service_role/SECURITY DEFINER skriver).

create table if not exists public.agentic_drafts (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key text unique not null,
  correlation_id  text,
  contact_ref     text,
  channel         text not null default 'email',
  subject         text,
  body            text not null,
  property_ids    jsonb not null default '[]'::jsonb,
  status          text not null default 'draft' check (status in ('draft','sent','discarded')),
  created_at      timestamptz default now()
);

create table if not exists public.agentic_buyer_profiles (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key text unique not null,
  brand_id        text,
  display_name    text,
  budget_max_eur  numeric,
  budget_min_eur  numeric,
  areas           jsonb not null default '[]'::jsonb,
  property_type   text,
  bedrooms_min    integer,
  must_haves      jsonb not null default '[]'::jsonb,
  exclusions      jsonb not null default '[]'::jsonb,
  confidence      numeric,
  provenance      text not null default 'ai_suggestion',
  status          text not null default 'ai_draft' check (status in ('ai_draft','needs_review','approved')),
  version         integer not null default 1,
  created_at      timestamptz default now()
);

alter table public.agentic_drafts enable row level security;
alter table public.agentic_buyer_profiles enable row level security;

drop policy if exists "agentic_drafts_deny_direct" on public.agentic_drafts;
create policy "agentic_drafts_deny_direct" on public.agentic_drafts
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "agentic_buyer_profiles_deny_direct" on public.agentic_buyer_profiles;
create policy "agentic_buyer_profiles_deny_direct" on public.agentic_buyer_profiles
  for all to anon, authenticated using (false) with check (false);
