-- Stop generated editorial copy from re-opening the conversion queue.
--
-- The conversion worker writes conversion_no only, but the editorial worker can
-- write description_no. For rows where town is derived from description_no,
-- that generated copy can change town and make conversion_no look stale again.

create or replace function public.queue_property_editorial_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Only feed-imported rows belong to the automatic level-B editorial flow.
  if coalesce(new.source, '') not in ('redsp', 'xml', 'csv') then
    return new;
  end if;

  -- UPDATE OF triggers still fire when an upsert mentions a column even if the
  -- effective facts did not change. Avoid re-queuing editorial work on no-op
  -- imports or preservation-trigger rewrites.
  if tg_op = 'UPDATE'
    and new.source_description is not distinct from old.source_description
    and new.description is not distinct from old.description
    and new.property_type is not distinct from old.property_type
    and new.bedrooms is not distinct from old.bedrooms
    and new.bathrooms is not distinct from old.bathrooms
    and new.location is not distinct from old.location
    and new.built_area is not distinct from old.built_area
    and new.floor_label is not distinct from old.floor_label
    and new.amenities_no is not distinct from old.amenities_no
    and new.energy_rating is not distinct from old.energy_rating
    and new.price is not distinct from old.price
    and new.facing_source is not distinct from old.facing_source
    and new.usage_source is not distinct from old.usage_source
    and new.pool is not distinct from old.pool
    and new.garage is not distinct from old.garage
  then
    return new;
  end if;

  insert into public.property_editorial_jobs (
    property_id,
    status,
    attempts,
    available_at,
    last_error,
    updated_at
  ) values (
    new.id,
    'queued',
    0,
    now(),
    null,
    now()
  )
  on conflict (property_id) do update
  set status = 'queued',
      attempts = 0,
      available_at = now(),
      last_error = null,
      updated_at = now();

  return new;
end;
$function$;

revoke execute on function public.queue_property_editorial_job() from public, anon, authenticated;
grant execute on function public.queue_property_editorial_job() to service_role;

create or replace function public.invalidate_property_conversion_editorial()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_description_changed boolean;
  description_changed boolean;
  description_no_changed boolean;
  source_available boolean;
  description_available boolean;
  only_generated_town_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.conversion_no := null;
    return new;
  end if;

  source_description_changed := new.source_description is distinct from old.source_description;
  description_changed := new.description is distinct from old.description;
  description_no_changed := new.description_no is distinct from old.description_no;
  source_available := coalesce(nullif(pg_catalog.btrim(new.source_description), ''), '') <> '';
  description_available := coalesce(nullif(pg_catalog.btrim(new.description), ''), '') <> '';
  only_generated_town_changed :=
    new.town is distinct from old.town
    and description_no_changed
    and not source_description_changed
    and not description_changed
    and new.property_type is not distinct from old.property_type
    and new.type is not distinct from old.type
    and new.bedrooms is not distinct from old.bedrooms
    and new.bathrooms is not distinct from old.bathrooms
    and new.location is not distinct from old.location
    and new.built_area is not distinct from old.built_area
    and new.area_m2 is not distinct from old.area_m2
    and new.plot_size is not distinct from old.plot_size
    and new.price is not distinct from old.price
    and new.pool is not distinct from old.pool
    and new.garage is not distinct from old.garage
    and new.energy_rating is not distinct from old.energy_rating
    and new.amenities_no is not distinct from old.amenities_no;

  if new.property_type is distinct from old.property_type
    or new.type is distinct from old.type
    or new.bedrooms is distinct from old.bedrooms
    or new.bathrooms is distinct from old.bathrooms
    or (
      new.town is distinct from old.town
      and not only_generated_town_changed
    )
    or new.location is distinct from old.location
    or new.built_area is distinct from old.built_area
    or new.area_m2 is distinct from old.area_m2
    or new.plot_size is distinct from old.plot_size
    or new.price is distinct from old.price
    or new.pool is distinct from old.pool
    or new.garage is distinct from old.garage
    or new.energy_rating is distinct from old.energy_rating
    or new.amenities_no is distinct from old.amenities_no
    or source_description_changed
    or (
      not source_available
      and description_changed
    )
    or (
      not source_available
      and not description_available
      and description_no_changed
    )
  then
    new.conversion_no := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invalidate_property_conversion_editorial on public.properties;
create trigger trg_invalidate_property_conversion_editorial
before insert or update of
  property_type,
  type,
  bedrooms,
  bathrooms,
  town,
  location,
  built_area,
  area_m2,
  plot_size,
  price,
  pool,
  garage,
  energy_rating,
  amenities_no,
  source_description,
  description,
  description_no
on public.properties
for each row
execute function public.invalidate_property_conversion_editorial();

comment on function public.invalidate_property_conversion_editorial() is
  'Invalidates conversion_no only when real conversion source facts change. Generated description_no may be used only as a last-resort source and does not invalidate through derived town when source_description or description is available.';
