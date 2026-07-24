-- Tighten public household invite claims without breaking the invite flow.

create schema if not exists family_private;

create or replace function family_private.enforce_public_household_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_email text;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Household member updates require an authenticated user'
      using errcode = '42501';
  end if;

  if exists (
      select 1
      from public.households h
      where h.id = old.household_id
        and h.owner_user_id = auth.uid()
    )
    and exists (
      select 1
      from public.households h
      where h.id = new.household_id
        and h.owner_user_id = auth.uid()
    ) then
    return new;
  end if;

  select lower(u.email)
    into current_email
  from auth.users u
  where u.id = auth.uid();

  if old.user_id is null
    and old.invited_email is not null
    and lower(old.invited_email) = current_email
    and new.id = old.id
    and new.household_id = old.household_id
    and new.user_id = auth.uid()
    and new.invited_email is null
    and new.name is not distinct from old.name
    and new.role is not distinct from old.role
    and new.invited_at is not distinct from old.invited_at
    and new.created_at is not distinct from old.created_at
    and new.joined_at is not null then
    return new;
  end if;

  raise exception 'Household member update is not allowed'
    using errcode = '42501';
end;
$$;

revoke execute on function family_private.enforce_public_household_member_update() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.household_members') is not null then
    drop trigger if exists enforce_public_household_member_update on public.household_members;
    create trigger enforce_public_household_member_update
      before update on public.household_members
      for each row
      execute function family_private.enforce_public_household_member_update();

    drop policy if exists "Inviterte kan se egne invitasjoner" on public.household_members;
    create policy "Inviterte kan se egne invitasjoner"
      on public.household_members
      for select
      to authenticated
      using (
        user_id is null
        and invited_email is not null
        and lower(invited_email) = nullif(lower(auth.jwt() ->> 'email'), '')
      );

    drop policy if exists "Invitasjoner kan claimes" on public.household_members;
    create policy "Invitasjoner kan claimes"
      on public.household_members
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.households h
          where h.id = household_members.household_id
            and h.owner_user_id = auth.uid()
        )
        or (
          user_id is null
          and invited_email is not null
          and lower(invited_email) = nullif(lower(auth.jwt() ->> 'email'), '')
        )
      )
      with check (
        exists (
          select 1
          from public.households h
          where h.id = household_members.household_id
            and h.owner_user_id = auth.uid()
        )
        or (
          user_id = auth.uid()
          and invited_email is null
        )
      );
  end if;
end $$;
