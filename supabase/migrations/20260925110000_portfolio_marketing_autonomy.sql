-- Owner authorization, 2026-09-25:
-- Active portfolio brands may publish through guarded controlled autopilot.
-- Freddy Bremseth public umbrella is authorized ONLY for the exact verified
-- public Facebook Page; the private Facebook profile and Art Instagram are not
-- autonomous umbrella destinations.
update public.marketing_brand_growth_plans
set status = 'active',
    autonomy_mode = 'controlled_auto',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{autopilot_channels}',
      case
        when brand_id = 'freddyb' then '["facebook"]'::jsonb
        else '["instagram","facebook"]'::jsonb
      end,
      true
    )
where brand_id in (
    'freddyb',
    'zeneco',
    'pinosoecolife',
    'donaanna',
    'chatgenius',
    'freddyart',
    'freddypublishing',
    'freddyai',
    'remasterfreddy'
  );
