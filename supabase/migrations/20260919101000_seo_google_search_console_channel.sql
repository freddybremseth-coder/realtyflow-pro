-- The Google Search Console OAuth grant is read-only and distinct from
-- Google Drive, Gmail, and YouTube permissions. Preserve all existing platforms.
ALTER TABLE public.oauth_states DROP CONSTRAINT IF EXISTS oauth_states_platform_check;
ALTER TABLE public.oauth_states ADD CONSTRAINT oauth_states_platform_check
  CHECK (platform = ANY (ARRAY[
    'youtube','google_drive','gmail','facebook','instagram','linkedin','tiktok',
    'pinterest','twitter','openart','amazon_ads','google_search_console'
  ]::text[]));

ALTER TABLE public.social_channels DROP CONSTRAINT IF EXISTS social_channels_platform_check;
ALTER TABLE public.social_channels ADD CONSTRAINT social_channels_platform_check
  CHECK (platform = ANY (ARRAY[
    'youtube','google_drive','gmail','facebook','instagram','linkedin','tiktok',
    'pinterest','twitter','amazon_ads','google_search_console'
  ]::text[]));
