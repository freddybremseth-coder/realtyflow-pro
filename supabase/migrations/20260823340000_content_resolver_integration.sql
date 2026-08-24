-- Marketing Growth OS — Phase 7.1C: Content Resolver + brand/account-isolasjon.
--
-- Utvider EKSISTERENDE tabeller (ingen ny content-tabell). Publikasjoner bærer nå
-- eksplisitt brand_id + account_id (P0-isolasjon: aldri feil konto), kilde
-- (hvilket eksisterende system assetet kom fra) og approved_asset_hash (bindes
-- til godkjent innhold; executor verifiserer før publisering). brand_context får
-- eksplisitt mapping til Content Hub-org + Ad-kampanjer (aldri fuzzy-match).

alter table public.marketing_publications add column if not exists brand_id text;
alter table public.marketing_publications add column if not exists account_id text;
alter table public.marketing_publications add column if not exists source_type text;
alter table public.marketing_publications add column if not exists source_id text;
alter table public.marketing_publications add column if not exists asset_hash text;
alter table public.marketing_publications add column if not exists reuse_mode text;

alter table public.brand_context add column if not exists content_hub_org_id text;
alter table public.brand_context add column if not exists ad_campaign_ids jsonb not null default '[]'::jsonb;
