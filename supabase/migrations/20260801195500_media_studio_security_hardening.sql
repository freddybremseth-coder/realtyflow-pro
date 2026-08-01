-- Media Studio security hardening after the initial production rollout.

alter function public.media_studio_touch_updated_at()
  set search_path = pg_catalog, public;

alter function public.media_studio_can_access(uuid)
  set search_path = pg_catalog, public, core;

-- The bucket is public, so public object URLs continue to work without a broad
-- SELECT policy. Removing this policy prevents unauthenticated bucket listing.
drop policy if exists "Public read media-studio" on storage.objects;

notify pgrst, 'reload schema';
