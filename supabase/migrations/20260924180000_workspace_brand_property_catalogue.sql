-- Brand-scoped public property catalogue for workspace employees.
-- Only explicitly website-visible properties with an explicit
-- property_brand_visibility.visible=true row for the selected brand are returned.
-- No feed/source/commission/internal fields are exposed.
create or replace function public.workspace_brand_property_catalogue(
  p_brand_key text, p_user_id uuid, p_email text, p_offset integer, p_search text
) returns jsonb language plpgsql stable security invoker set search_path = '' as $workspace_property_catalogue$
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

  -- Serialize a staff catalogue read with concurrent membership revocation.
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
      'primary_image',rows.primary_image
    ) order by rows.created_at desc nulls last, rows.id), '[]'::jsonb),
    'hasMore', count(*) > 24
  ) into v_result
  from (
    select p.id,p.ref,p.title,p.town,p.location,p.price,p.bedrooms,p.bathrooms,
      p.area_m2,p.plot_size,p.property_type,p.primary_image,p.created_at
    from public.property_brand_visibility v
    join public.properties p on p.id=v.property_id
    where v.brand_id=p_brand_key and v.visible=true
      and p.show_on_website=true and p.website_visible=true
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
