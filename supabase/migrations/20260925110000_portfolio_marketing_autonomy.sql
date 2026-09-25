-- Owner authorization, 2026-09-25:
-- Portfolio brands may publish through the guarded Marketing Autopilot without
-- per-post approval. The Freddy Bremseth personal umbrella is excluded.
-- Existing setup plans for included portfolio brands are activated by owner request.
update public.marketing_brand_growth_plans
set status = 'active',
    autonomy_mode = 'controlled_auto',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{autopilot_channels}',
      '["instagram","facebook"]'::jsonb,
      true
    )
where brand_id in (
    'zeneco',
    'pinosoecolife',
    'donaanna',
    'chatgenius',
    'freddyart',
    'freddypublishing',
    'freddyai',
    'remasterfreddy'
  );
