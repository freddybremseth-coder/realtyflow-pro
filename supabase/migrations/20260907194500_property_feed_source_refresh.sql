-- Apply refreshed XML source facts only to properties that already exist.
-- This lets server-side feed refreshes backfill full descriptions without
-- creating incomplete property rows or touching commercial property fields.

create or replace function public.apply_property_feed_source_facts(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_updated integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with payload as (
    select
      nullif(btrim(item->>'ref'), '') as ref,
      nullif(item->>'source_description', '') as source_description,
      coalesce(
        array(
          select jsonb_array_elements_text(
            case
              when jsonb_typeof(item->'amenities_no') = 'array' then item->'amenities_no'
              else '[]'::jsonb
            end
          )
        ),
        '{}'::text[]
      ) as amenities_no,
      nullif(item->>'floor_label', '') as floor_label,
      nullif(item->>'facing_source', '') as facing_source,
      nullif(item->>'usage_source', '') as usage_source
    from jsonb_array_elements(p_rows) item
  ), updated as (
    update public.properties p
    set
      source_description = coalesce(s.source_description, p.source_description),
      amenities_no = s.amenities_no,
      floor_label = s.floor_label,
      facing_source = s.facing_source,
      usage_source = s.usage_source
    from payload s
    where s.ref is not null
      and p.ref = s.ref
      and coalesce(p.source, '') in ('redsp', 'xml', 'csv')
      and (
        p.source_description is distinct from coalesce(s.source_description, p.source_description)
        or p.amenities_no is distinct from s.amenities_no
        or p.floor_label is distinct from s.floor_label
        or p.facing_source is distinct from s.facing_source
        or p.usage_source is distinct from s.usage_source
      )
    returning p.id
  )
  select count(*)::integer into v_updated from updated;

  return v_updated;
end;
$function$;

revoke all on function public.apply_property_feed_source_facts(jsonb) from public;
revoke all on function public.apply_property_feed_source_facts(jsonb) from anon, authenticated;
grant execute on function public.apply_property_feed_source_facts(jsonb) to service_role;
