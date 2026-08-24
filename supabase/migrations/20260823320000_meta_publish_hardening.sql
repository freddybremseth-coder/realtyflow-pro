-- Marketing Growth OS — Phase 7.1B: Meta Production Hardening.
--
-- Modellerer Meta sin virkelige publiseringslivssyklus. Attempt-ledgeren får en
-- state machine: reserved → container_created → processing → publishing → posted
-- (feil → failed; uavklart publish → manual_review). container_id +
-- external_media_id skiller Instagram-container fra endelig publisert media.
-- marketing_assets får media (image/video URL, media_type, alt_text) — Instagram
-- publiserer aldri bare caption.

alter table public.marketing_publish_attempts drop constraint if exists marketing_publish_attempts_status_check;
alter table public.marketing_publish_attempts
  add constraint marketing_publish_attempts_status_check
  check (status in ('reserved','container_created','processing','publishing','posted','failed','manual_review'));

alter table public.marketing_publish_attempts add column if not exists container_id text;
alter table public.marketing_publish_attempts add column if not exists external_media_id text;
alter table public.marketing_publish_attempts add column if not exists media_type text;

alter table public.marketing_assets add column if not exists media jsonb;
