-- YouTube publishing must have one unambiguous canonical destination.
-- Cross-brand reuse of the same active YouTube channel is also blocked because
-- it makes autonomous routing unsafe. Historical/inactive rows remain allowed
-- for audit and reconnect history.
--
-- The canonical token store is oauth_tokens. Remove the old per-brand mirror
-- so a stale brand_settings token cannot become a fallback publishing route.

update public.brand_settings
set settings = settings - 'youtube_refresh_token',
    updated_at = now()
where brand_id in (
  'zeneco',
  'pinosoecolife',
  'donaanna',
  'chatgenius',
  'freddyb',
  'freddypublishing',
  'freddyai',
  'remasterfreddy'
)
  and settings ? 'youtube_refresh_token';

create unique index if not exists social_channels_one_active_youtube_per_brand
  on public.social_channels (brand_id)
  where platform = 'youtube' and is_active = true;

create unique index if not exists social_channels_active_youtube_external_unique
  on public.social_channels (external_id)
  where platform = 'youtube' and is_active = true;
