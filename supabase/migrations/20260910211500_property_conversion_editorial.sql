alter table public.properties
  add column if not exists conversion_no jsonb;

comment on column public.properties.conversion_no is
  'Fact-based Norwegian conversion editorial for ZenEco Homes: selling intro, documented reasons, lifestyle framing, ideal-for guidance, CTA, source hash and provenance.';

create or replace function public.invalidate_property_conversion_editorial()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.conversion_no := null;
    return new;
  end if;

  if new.title is distinct from old.title
    or new.title_no is distinct from old.title_no
    or new.property_type is distinct from old.property_type
    or new.type is distinct from old.type
    or new.bedrooms is distinct from old.bedrooms
    or new.bathrooms is distinct from old.bathrooms
    or new.town is distinct from old.town
    or new.location is distinct from old.location
    or new.built_area is distinct from old.built_area
    or new.area_m2 is distinct from old.area_m2
    or new.plot_size is distinct from old.plot_size
    or new.price is distinct from old.price
    or new.pool is distinct from old.pool
    or new.garage is distinct from old.garage
    or new.energy_rating is distinct from old.energy_rating
    or new.amenities_no is distinct from old.amenities_no
    or new.source_description is distinct from old.source_description
    or new.description is distinct from old.description
    or new.description_no is distinct from old.description_no
  then
    new.conversion_no := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invalidate_property_conversion_editorial on public.properties;
create trigger trg_invalidate_property_conversion_editorial
before insert or update of
  title,
  title_no,
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

-- Existing inventory is intentionally queued implicitly by leaving conversion_no NULL.
-- The cron backfills in small batches and the trigger invalidates copy whenever source facts change.
