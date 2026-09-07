-- Public property visibility quality guard.
-- A property is automatically hidden only when ALL three signals indicate an
-- unusable feed row: no public feed reference, no usable location and no price.
-- Legitimate manual properties with useful data are not affected.

create or replace function public.guard_invalid_property_public_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(new.ref, '')), '') is null
     and lower(btrim(coalesce(new.location, ''))) in ('', 'ukjent', 'unknown', 'ikke angitt')
     and coalesce(new.price, 0) <= 0 then
    new.show_on_website := false;
    new.website_visible := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_invalid_property_public_visibility on public.properties;

create trigger trg_guard_invalid_property_public_visibility
before insert or update of ref, location, price, show_on_website, website_visible
on public.properties
for each row
execute function public.guard_invalid_property_public_visibility();

-- Clean up any existing rows matching the same strict rule. This is intentionally
-- condition-based rather than ID-based so the migration is portable.
update public.properties
set show_on_website = false,
    website_visible = false
where nullif(btrim(coalesce(ref, '')), '') is null
  and lower(btrim(coalesce(location, ''))) in ('', 'ukjent', 'unknown', 'ikke angitt')
  and coalesce(price, 0) <= 0
  and (show_on_website is distinct from false or website_visible is distinct from false);

comment on function public.guard_invalid_property_public_visibility() is
  'Prevents clearly invalid feed rows (missing ref + unknown location + non-positive price) from being publicly visible.';
