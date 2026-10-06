-- Expand employee workspace property search and CRM list filters without widening data access.
-- Existing callers remain compatible because all new parameters have defaults.
-- The functions stay service-role-only and re-check live workspace grants atomically.

drop function if exists public.workspace_brand_property_catalogue(text,uuid,text,integer,text);

create function public.workspace_brand_property_catalogue(
  p_brand_key text,
  p_user_id uuid,
  p_email text,
  p_offset integer,
  p_search text,
  p_area text default '',
  p_property_type text default '',
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_bedrooms_min integer default null,
  p_bathrooms_min integer default null,
  p_pool boolean default null,
  p_area_min numeric default null,
  p_plot_min numeric default null,
  p_sort text default 'newest'
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $workspace_property_catalogue$
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
    or length(coalesce(p_area,'')) > 80
    or length(coalesce(p_property_type,'')) > 80
    or (p_price_min is not null and (p_price_min < 0 or p_price_min > 100000000))
    or (p_price_max is not null and (p_price_max < 0 or p_price_max > 100000000))
    or (p_price_min is not null and p_price_max is not null and p_price_min > p_price_max)
    or (p_bedrooms_min is not null and (p_bedrooms_min < 0 or p_bedrooms_min > 20))
    or (p_bathrooms_min is not null and (p_bathrooms_min < 0 or p_bathrooms_min > 20))
    or (p_area_min is not null and (p_area_min < 0 or p_area_min > 1000000))
    or (p_plot_min is not null and (p_plot_min < 0 or p_plot_min > 10000000))
    or coalesce(p_sort,'') not in ('newest','price_asc','price_desc','area_desc')
  then
    return null;
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id
    and m.email=p_email
    and m.status='active'
    and m.permissions @> array['properties.catalog.read']::text[]
  for share of m;

  if v_brand_id is null then
    return null;
  end if;

  with filtered as (
    select
      p.id,p.ref,p.title,p.town,p.location,p.price,p.bedrooms,p.bathrooms,
      p.area_m2,p.plot_size,p.property_type,p.primary_image,p.created_at,p.source,p.pool,
      coalesce((
        select array_agg(v.brand_id order by v.brand_id)
        from public.property_brand_visibility v
        where v.property_id=p.id and v.visible=true
      ), '{}'::text[]) as marketable_by_brands,
      exists (
        select 1
        from public.property_brand_visibility v
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
      and (
        coalesce(p_area,'')=''
        or position(lower(p_area) in lower(coalesce(p.town,''))) > 0
        or position(lower(p_area) in lower(coalesce(p.location,''))) > 0
      )
      and (
        coalesce(p_property_type,'')=''
        or position(lower(p_property_type) in lower(coalesce(p.property_type,''))) > 0
      )
      and (p_price_min is null or p.price >= p_price_min)
      and (p_price_max is null or p.price <= p_price_max)
      and (p_bedrooms_min is null or p.bedrooms >= p_bedrooms_min)
      and (p_bathrooms_min is null or p.bathrooms >= p_bathrooms_min)
      and (p_pool is null or p.pool = p_pool)
      and (p_area_min is null or p.area_m2 >= p_area_min)
      and (p_plot_min is null or p.plot_size >= p_plot_min)
  ),
  ranked as (
    select filtered.*,
      row_number() over (
        order by
          case when p_sort='price_asc' then price end asc nulls last,
          case when p_sort='price_desc' then price end desc nulls last,
          case when p_sort='area_desc' then area_m2 end desc nulls last,
          case when p_sort='newest' then created_at end desc nulls last,
          created_at desc nulls last,
          id
      ) as result_order
    from filtered
  ),
  paged as (
    select *
    from ranked
    where result_order > p_offset
      and result_order <= p_offset + 25
  )
  select jsonb_build_object(
    'properties', coalesce((
      select jsonb_agg(jsonb_build_object(
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
        'pool',rows.pool,
        'marketable_by_brands',rows.marketable_by_brands,
        'can_market_on_workspace_brand',rows.can_market_on_workspace_brand
      ) order by rows.result_order)
      from paged rows
      where rows.result_order <= p_offset + 24
    ), '[]'::jsonb),
    'hasMore', (select count(*) > 24 from paged),
    'matchedCount', (select count(*)::integer from filtered)
  ) into v_result;

  return v_result;
end;
$workspace_property_catalogue$;

revoke execute on function public.workspace_brand_property_catalogue(
  text,uuid,text,integer,text,text,text,numeric,numeric,integer,integer,boolean,numeric,numeric,text
) from public, anon, authenticated;
grant execute on function public.workspace_brand_property_catalogue(
  text,uuid,text,integer,text,text,text,numeric,numeric,integer,integer,boolean,numeric,numeric,text
) to service_role;


drop function if exists public.workspace_brand_contacts(text,uuid,text,integer,text);

create function public.workspace_brand_contacts(
  p_brand_key text,
  p_user_id uuid,
  p_email text,
  p_offset integer,
  p_search text,
  p_status text default '',
  p_source text default '',
  p_sort text default 'updated_desc'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $workspace_brand_contacts$
declare
  v_brand_id uuid;
  v_result jsonb;
begin
  if p_brand_key is null or p_brand_key = 'zeneco'
    or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_offset is null or p_offset < 0 or p_offset > 49950
    or length(coalesce(p_search,'')) > 80
    or length(coalesce(p_source,'')) > 80
    or (coalesce(p_status,'') <> '' and p_status not in (
      'NEW','CONTACT','QUALIFIED','VIEWING','NEGOTIATION','WON','ON_HOLD','LOST'
    ))
    or coalesce(p_sort,'') not in ('updated_desc','updated_asc','created_desc','name_asc')
  then
    return null;
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id
    and m.email=p_email
    and m.status='active'
    and m.permissions @> array['crm.read']::text[]
  for share of m;

  if v_brand_id is null then
    return null;
  end if;

  with filtered as (
    select c.id,c.name,c.email,c.phone,c.brand_id,c.brand,
      c.pipeline_status,c.source,c.created_at,c.updated_at
    from public.contacts c
    where c.brand_id=p_brand_key
      and c.brand=p_brand_key
      and (
        coalesce(p_search,'') = ''
        or position(lower(p_search) in lower(coalesce(c.name,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.email,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.phone,''))) > 0
      )
      and (coalesce(p_status,'') = '' or c.pipeline_status = p_status)
      and (
        coalesce(p_source,'') = ''
        or position(lower(p_source) in lower(coalesce(c.source,''))) > 0
      )
  ),
  ranked as (
    select filtered.*,
      row_number() over (
        order by
          case when p_sort='name_asc' then lower(name) end asc nulls last,
          case when p_sort='created_desc' then created_at end desc nulls last,
          case when p_sort='updated_asc' then updated_at end asc nulls last,
          case when p_sort='updated_desc' then updated_at end desc nulls last,
          updated_at desc nulls last,
          id
      ) as result_order
    from filtered
  ),
  paged as (
    select *
    from ranked
    where result_order > p_offset
      and result_order <= p_offset + 51
  )
  select jsonb_build_object(
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',rows.id,
        'name',rows.name,
        'email',rows.email,
        'phone',rows.phone,
        'brand_id',rows.brand_id,
        'brand',rows.brand,
        'pipeline_status',rows.pipeline_status,
        'source',rows.source,
        'created_at',rows.created_at,
        'updated_at',rows.updated_at
      ) order by rows.result_order)
      from paged rows
      where rows.result_order <= p_offset + 50
    ), '[]'::jsonb),
    'hasMore', (select count(*) > 50 from paged),
    'summary', jsonb_build_object(
      'matchedCount', (select count(*)::integer from filtered),
      'staleCount', (
        select count(*)::integer
        from filtered
        where updated_at is null or updated_at < now() - interval '7 days'
      ),
      'statusCounts', coalesce((
        select jsonb_object_agg(status_key, status_count order by status_key)
        from (
          select coalesce(nullif(pipeline_status,''),'UNSET') as status_key, count(*)::integer as status_count
          from filtered
          group by 1
        ) counts
      ), '{}'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$workspace_brand_contacts$;

revoke execute on function public.workspace_brand_contacts(
  text,uuid,text,integer,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.workspace_brand_contacts(
  text,uuid,text,integer,text,text,text,text
) to service_role;


drop function if exists public.workspace_zeneco_joint_contacts(uuid,text,integer,text);

create function public.workspace_zeneco_joint_contacts(
  p_user_id uuid,
  p_email text,
  p_offset integer,
  p_search text,
  p_status text default '',
  p_source text default '',
  p_sort text default 'updated_desc'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $workspace_zeneco_joint_contacts$
declare
  v_brand_id uuid;
  v_result jsonb;
begin
  if p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_offset is null or p_offset < 0 or p_offset > 49950
    or length(coalesce(p_search,'')) > 80
    or length(coalesce(p_source,'')) > 80
    or (coalesce(p_status,'') <> '' and p_status not in (
      'NEW','CONTACT','QUALIFIED','VIEWING','NEGOTIATION','WON','ON_HOLD','LOST'
    ))
    or coalesce(p_sort,'') not in ('updated_desc','updated_asc','created_desc','name_asc')
  then
    return null;
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key='zeneco'
  where m.user_id=p_user_id
    and m.email=p_email
    and m.status='active'
    and m.permissions @> array['crm.joint.read']::text[]
  for share of m;

  if v_brand_id is null then
    return null;
  end if;

  with filtered as (
    select c.id,c.name,c.email,c.phone,c.brand_id,c.brand,
      c.pipeline_status,c.source,c.created_at,c.updated_at
    from core.zeneco_joint_lead_cohort j
    join public.contacts c on c.id=j.contact_id
    where j.brand_id=v_brand_id
      and j.eligibility='approved'
      and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
      and length(btrim(coalesce(j.evidence_reference,''))) >= 8
      and j.reviewed_at is not null
      and c.brand_id='zeneco'
      and c.brand='zeneco'
      and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
      and (
        coalesce(p_search,'') = ''
        or position(lower(p_search) in lower(coalesce(c.name,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.email,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.phone,''))) > 0
      )
      and (coalesce(p_status,'') = '' or c.pipeline_status = p_status)
      and (
        coalesce(p_source,'') = ''
        or position(lower(p_source) in lower(coalesce(c.source,''))) > 0
      )
  ),
  ranked as (
    select filtered.*,
      row_number() over (
        order by
          case when p_sort='name_asc' then lower(name) end asc nulls last,
          case when p_sort='created_desc' then created_at end desc nulls last,
          case when p_sort='updated_asc' then updated_at end asc nulls last,
          case when p_sort='updated_desc' then updated_at end desc nulls last,
          updated_at desc nulls last,
          id
      ) as result_order
    from filtered
  ),
  paged as (
    select *
    from ranked
    where result_order > p_offset
      and result_order <= p_offset + 51
  )
  select jsonb_build_object(
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',rows.id,
        'name',rows.name,
        'email',rows.email,
        'phone',rows.phone,
        'brand_id',rows.brand_id,
        'brand',rows.brand,
        'pipeline_status',rows.pipeline_status,
        'source',rows.source,
        'created_at',rows.created_at,
        'updated_at',rows.updated_at
      ) order by rows.result_order)
      from paged rows
      where rows.result_order <= p_offset + 50
    ), '[]'::jsonb),
    'hasMore', (select count(*) > 50 from paged),
    'summary', jsonb_build_object(
      'matchedCount', (select count(*)::integer from filtered),
      'staleCount', (
        select count(*)::integer
        from filtered
        where updated_at is null or updated_at < now() - interval '7 days'
      ),
      'statusCounts', coalesce((
        select jsonb_object_agg(status_key, status_count order by status_key)
        from (
          select coalesce(nullif(pipeline_status,''),'UNSET') as status_key, count(*)::integer as status_count
          from filtered
          group by 1
        ) counts
      ), '{}'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$workspace_zeneco_joint_contacts$;

revoke execute on function public.workspace_zeneco_joint_contacts(
  uuid,text,integer,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.workspace_zeneco_joint_contacts(
  uuid,text,integer,text,text,text,text
) to service_role;
