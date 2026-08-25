update public.ad_creatives ac
set
  tracking_code = coalesce(ac.tracking_code, 'rfad_' || replace(ac.id::text, '-', '')),
  growth_goal = coalesce(c.growth_goal, 'unspecified'),
  hook_family = coalesce(ac.hook_family, case coalesce(ac.concept_group,'')
    when 'premium_hero' then 'authority'
    when 'lifestyle_context' then 'aspiration'
    when 'scandinavian_clean' then 'clarity'
    when 'organic_natural' then 'authenticity'
    when 'detail_craft' then 'specificity'
    when 'health_wellness' then 'outcome'
    when 'seasonal_moment' then 'timeliness'
    when 'gift_luxury' then 'aspiration'
    when 'social_proof' then 'trust'
    when 'promo_offer' then 'offer'
    else 'unclassified' end),
  language = coalesce(ac.language, c.default_language),
  creative_format = coalesce(ac.creative_format, case ac.aspect_ratio
    when '9:16' then 'image_vertical'
    when '4:5' then 'image_portrait'
    when '1:1' then 'image_square'
    else 'image_other' end),
  creative_dna = case when ac.creative_dna = '{}'::jsonb then jsonb_build_object(
    'schemaVersion', 1,
    'growthGoal', coalesce(c.growth_goal,'unspecified'),
    'conceptFamily', coalesce(ac.concept_group,''),
    'hookFamily', case coalesce(ac.concept_group,'')
      when 'premium_hero' then 'authority'
      when 'lifestyle_context' then 'aspiration'
      when 'scandinavian_clean' then 'clarity'
      when 'organic_natural' then 'authenticity'
      when 'detail_craft' then 'specificity'
      when 'health_wellness' then 'outcome'
      when 'seasonal_moment' then 'timeliness'
      when 'gift_luxury' then 'aspiration'
      when 'social_proof' then 'trust'
      when 'promo_offer' then 'offer'
      else 'unclassified' end,
    'angle', coalesce(ac.angle,''),
    'mood', coalesce(ac.mood,''),
    'creativeFormat', case ac.aspect_ratio when '9:16' then 'image_vertical' when '4:5' then 'image_portrait' when '1:1' then 'image_square' else 'image_other' end,
    'aspectRatio', coalesce(ac.aspect_ratio,''),
    'language', c.default_language,
    'audienceSegments', coalesce(to_jsonb(c.audience_segments), '[]'::jsonb),
    'targetMarkets', coalesce(to_jsonb(c.target_markets), '[]'::jsonb),
    'funnelStage', c.funnel_stage,
    'offer', c.offer,
    'headline', ac.overlay_headline,
    'subheadline', ac.overlay_subheadline,
    'cta', ac.overlay_cta,
    'providerRequested', coalesce(ac.provider,''),
    'modelRequested', coalesce(ac.model,''),
    'promptVersion', 'legacy-backfill-v1',
    'preserveProductIdentity', coalesce(c.preserve_product_identity,true),
    'campaignStyle', coalesce(c.campaign_style,'mixed'),
    'backfilled', true
  ) else ac.creative_dna end
from public.ad_campaigns c
where c.id = ac.campaign_id;
