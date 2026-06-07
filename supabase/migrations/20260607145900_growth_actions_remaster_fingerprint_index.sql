-- Speed up Re-Master duplicate checks in growth_actions without enforcing
-- uniqueness or cleaning existing data.
--
-- Read-only production audit on 2026-06-07:
-- - public.growth_actions had 1 row
-- - no remasterfreddy/youtube fingerprint rows existed
-- - no duplicate remasterfreddy/youtube fingerprints existed
--
-- This is intentionally a partial performance index, not a unique constraint.

create index if not exists idx_growth_actions_remaster_fingerprint
  on public.growth_actions (brand, platform, hypothesis)
  where brand = 'remasterfreddy'
    and platform = 'youtube'
    and hypothesis is not null;
