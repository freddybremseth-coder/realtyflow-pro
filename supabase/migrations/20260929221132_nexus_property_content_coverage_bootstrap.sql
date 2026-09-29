with covered_groups(refs) as (
  values
    (array['N9098','N9096','N9203']::text[]),
    (array['N9010','N8313','SP1296']::text[]),
    (array['N9860','N9203']::text[]),
    (array['SP0674','N9860','N6149']::text[]),
    (array['N9095','N8511','SP1617']::text[]),
    (array['SP1663','N8643']::text[]),
    (array['N9835','N8313','N8058']::text[]),
    (array['SP1296','N9834']::text[])
),
pairs as (
  select distinct least(a.ref,b.ref) ref_a, greatest(a.ref,b.ref) ref_b
  from covered_groups g
  cross join lateral unnest(g.refs) with ordinality a(ref,ord_a)
  cross join lateral unnest(g.refs) with ordinality b(ref,ord_b)
  where a.ord_a < b.ord_b
),
types(opportunity_type) as (
  values ('same_price_area_gap'),('cross_area_same_budget'),('property_type_tradeoff')
)
insert into public.property_content_opportunities (
  brand_id,signature,opportunity_type,score,title,summary,editorial_angle,
  supporting_keywords,audience,property_refs,property_ids,evidence,draft_markdown,
  status,detected_at,expires_at,dismissed_at,updated_at
)
select
  'zeneco',
  t.opportunity_type || ':' || p.ref_a || ':' || p.ref_b,
  t.opportunity_type,
  0,
  'Allerede dekket i Zen Magasin',
  'Dette boligparet inngår allerede i en publisert Marked akkurat nå-artikkel.',
  'Bootstrap-tombstone som hindrer Nexus i å foreslå samme dokumenterte sammenligning på nytt.',
  array['covered-existing-magazine'],
  'Intern deduplisering',
  array[p.ref_a,p.ref_b],
  '{}'::uuid[],
  jsonb_build_object('bootstrap',true,'covered_existing_magazine',true),
  '',
  'dismissed',
  now(),
  now() + interval '3650 days',
  now(),
  now()
from pairs p cross join types t
on conflict (brand_id,signature) do nothing;
