-- Expand workspace property search from brand-published listings to the shared
-- ordinary PUBLIC catalogue used for buyer matching.
--
-- Access remains brand-membership gated. The requested brand grants access to
-- the workspace tool; it does not claim ownership of every returned listing.
-- Only explicit safe fields are returned. Feed credentials, import IDs,
-- internal descriptions, pricing notes and commissions stay server-only.
--
-- Marketing availability is returned separately so staff can match any public
-- listing but may only create brand content when that exact brand has
-- property_brand_visibility.visible=true.
create or replace function public.workspace_brand_property_catalogue(
  p_brand_key text, p_user_id uuid, p_email text, p_offset integer, p_search text
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $workspace_property_catalogue$
declare
  v_brand_id uuid;
  v_result jsonb;
begin
  if p_brand_key is null
    or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_offset is null or p_offset < 0 or p_offset > 5000
    or length(coalesce(p_search,'')) > 80
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['properties.catalog.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select jsonb_build_object(
    'properties', coalesce(jsonb_agg(jsonb_build_object(
      'id',rows.id,
      'ref',rows.ref,
      'title',rows.title,
      'town',rows.town,
      'location',rows.location,
      'price',rows.price,
      'bedrooms',rows.bedrooms,
      'bathrooms',rows.bathrooms,
      'area_m2',rows.area_m2,
      'plot_size',rows.plot_size,
      'property_type',rows.property_type,
      'primary_image',rows.primary_image,
      'source',rows.source,
      'marketable_by_brands',rows.marketable_by_brands,
      'can_market_on_workspace_brand',rows.can_market_on_workspace_brand
    ) order by rows.created_at desc nulls last, rows.id), '[]'::jsonb),
    'hasMore', count(*) > 24
  ) into v_result
  from (
    select p.id,p.ref,p.title,p.town,p.location,p.price,p.bedrooms,p.bathrooms,
      p.area_m2,p.plot_size,p.property_type,p.primary_image,p.created_at,p.source,
      coalesce((
        select array_agg(v.brand_id order by v.brand_id)
        from public.property_brand_visibility v
        where v.property_id=p.id and v.visible=true
      ), '{}'::text[]) as marketable_by_brands,
      exists (
        select 1 from public.property_brand_visibility v
        where v.property_id=p.id and v.brand_id=p_brand_key and v.visible=true
      ) as can_market_on_workspace_brand
    from public.properties p
    where p.show_on_website=true
      and p.website_visible=true
      and p.status='TILGJENGELIG'
      and (
        coalesce(p_search,'')=''
        or position(lower(p_search) in lower(coalesce(p.title,''))) > 0
        or position(lower(p_search) in lower(coalesce(p.town,''))) > 0
        or position(lower(p_search) in lower(coalesce(p.location,''))) > 0
        or position(lower(p_search) in lower(coalesce(p.ref,''))) > 0
      )
    order by p.created_at desc nulls last,p.id
    offset p_offset limit 25
  ) rows;

  return v_result;
end; $workspace_property_catalogue$;

revoke execute on function public.workspace_brand_property_catalogue(text,uuid,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.workspace_brand_property_catalogue(text,uuid,text,integer,text)
  to service_role;
