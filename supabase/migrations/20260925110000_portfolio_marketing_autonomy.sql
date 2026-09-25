-- Owner authorization, 2026-09-25:
-- Active portfolio brands may publish through the guarded Marketing Autopilot
-- without per-post approval. The Freddy Bremseth personal umbrella is excluded.
-- Inactive growth plans remain inactive and are not reactivated by this change.
update public.marketing_brand_growth_plans
set autonomy_mode = 'controlled_auto',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{autopilot_channels}',
      '["instagram","facebook"]'::jsonb,
      true
    )
where status = 'active'
  and brand_id in (
    'zeneco',
    'pinosoecolife',
    'donaanna',
    'chatgenius',
    'freddyart',
    'freddypublishing',
    'freddyai',
    'remasterfreddy'
  );
