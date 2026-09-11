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
    or (
      coalesce(nullif(btrim(new.source_description), ''), '') = ''
      and new.description is distinct from old.description
    )
    or (
      coalesce(nullif(btrim(new.source_description), ''), '') = ''
      and coalesce(nullif(btrim(new.description), ''), '') = ''
      and new.description_no is distinct from old.description_no
    )
  then
    new.conversion_no := null;
  end if;

  return new;
end;
$$;

comment on function public.invalidate_property_conversion_editorial() is
  'Invalidates conversion_no only when the effective conversion source changes. Source precedence matches application logic: source_description, then description, then description_no.';
