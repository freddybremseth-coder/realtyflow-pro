-- Marketing Growth OS — Phase 7.1D: Multi-Account Routing.
--
-- Publiseringsdestinasjon er brand → service → market/language → channel → konto,
-- ikke brand → én konto. Publikasjonen bærer nå eksplisitt service +
-- publishing_account_id (avgjort tidlig, ikke i siste sekund i publisheren).
-- Kontoenes scope (service/market/language) lever i social_channels.metadata
-- (eksisterende jsonb — ingen ny tabell).

alter table public.marketing_publications add column if not exists service text;
alter table public.marketing_publications add column if not exists publishing_account_id text;

-- Rask oppslag av kontoer per brand+plattform (auto-routing + ambiguitetssjekk).
create index if not exists idx_social_channels_brand_platform
  on public.social_channels (brand_id, platform, is_active);
