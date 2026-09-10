create or replace view public.property_conversion_metrics_daily
with (security_invoker = true)
as
select
  date_trunc('day', occurred_at)::date as day,
  coalesce(nullif(metadata->>'property_ref', ''), regexp_replace(content_id, '^property:', '')) as property_ref,
  count(*) filter (where event_type = 'property_conversion_view')::integer as views,
  count(*) filter (where event_type = 'property_conversion_cta_click')::integer as cta_clicks,
  count(*) filter (where event_type = 'property_lead_submit')::integer as leads,
  round(
    100.0 * count(*) filter (where event_type = 'property_conversion_cta_click')
      / nullif(count(*) filter (where event_type = 'property_conversion_view'), 0),
    2
  ) as cta_rate_percent,
  round(
    100.0 * count(*) filter (where event_type = 'property_lead_submit')
      / nullif(count(*) filter (where event_type = 'property_conversion_view'), 0),
    2
  ) as lead_rate_percent,
  count(*) filter (
    where event_type = 'property_conversion_view'
      and coalesce(metadata->>'copy_source', genome->>'copy_source') = 'realtyflow'
  )::integer as realtyflow_copy_views,
  count(*) filter (
    where event_type = 'property_conversion_view'
      and coalesce(metadata->>'copy_source', genome->>'copy_source') = 'fallback'
  )::integer as fallback_copy_views
from public.marketing_events
where brand_id = 'zeneco'
  and channel = 'website'
  and event_type in ('property_conversion_view', 'property_conversion_cta_click', 'property_lead_submit')
  and coalesce(nullif(metadata->>'property_ref', ''), regexp_replace(content_id, '^property:', '')) <> ''
group by
  date_trunc('day', occurred_at)::date,
  coalesce(nullif(metadata->>'property_ref', ''), regexp_replace(content_id, '^property:', ''));

comment on view public.property_conversion_metrics_daily is
  'Daily ZenEco property conversion funnel: conversion-story views, CTA clicks, lead submits and rates by property reference.';
