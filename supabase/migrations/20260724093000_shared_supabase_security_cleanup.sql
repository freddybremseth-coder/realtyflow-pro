-- Shared Supabase security cleanup for RealtyFlow / Family / Olivia.
-- Keeps today's effective access model, but removes direct RPC exposure for
-- internal helper functions and makes closed RLS tables explicit.

create schema if not exists family_private;
revoke all on schema family_private from public;
grant usage on schema family_private to anon, authenticated, service_role;

create or replace function family_private.is_data_accessible_to_member(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.households h
      join public.household_members m on m.household_id = h.id
      where h.owner_user_id = target_user_id
        and m.user_id = auth.uid()
    );
$$;

create or replace function family_private.is_household_owner_or_member(hh_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.households
    where id = hh_id
      and owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.household_members
    where household_id = hh_id
      and user_id = auth.uid()
  );
$$;

create or replace function family_private.is_household_owner(p_household_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from family.households
    where id = p_household_id
      and owner_user_id = p_user_id
  );
$$;

create or replace function family_private.is_household_member(p_household_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from family.household_members
    where household_id = p_household_id
      and user_id = p_user_id
  );
$$;

create or replace function family_private.is_household_adult_or_owner(p_household_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select family_private.is_household_owner(p_household_id, p_user_id)
    or exists (
      select 1
      from family.household_members
      where household_id = p_household_id
        and user_id = p_user_id
        and role in ('owner', 'adult')
    );
$$;

create or replace function family_private.can_access_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select family_private.is_household_owner(target_household_id, auth.uid())
    or family_private.is_household_member(target_household_id, auth.uid());
$$;

create or replace function family_private.can_manage_household_documents(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select family_private.is_household_owner(target_household_id, auth.uid())
    or family_private.is_household_adult_or_owner(target_household_id, auth.uid());
$$;

revoke execute on all functions in schema family_private from public;
grant execute on all functions in schema family_private to anon, authenticated, service_role;

do $$
declare
  rec record;
  new_qual text;
  new_check text;
  cmd text;
  roles_sql text;
  sql text;
begin
  for rec in
    select
      pn.nspname as schema_name,
      pc.relname as table_name,
      p.polname as policy_name,
      p.polcmd,
      p.polpermissive,
      pg_get_expr(p.polqual, p.polrelid) as qual,
      pg_get_expr(p.polwithcheck, p.polrelid) as with_check,
      (
        select string_agg(
          case when role_oid = 0 then 'public' else quote_ident(r.rolname) end,
          ', '
          order by case when role_oid = 0 then 'public' else r.rolname end
        )
        from unnest(p.polroles) as role_oid
        left join pg_roles r on r.oid = role_oid
      ) as roles_sql
    from pg_policy p
    join pg_class pc on pc.oid = p.polrelid
    join pg_namespace pn on pn.oid = pc.relnamespace
    where pn.nspname in ('public', 'family', 'storage')
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ '(public\\.)?is_data_accessible_to_member\\('
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '(public\\.)?is_data_accessible_to_member\\('
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ '(public\\.)?is_household_owner_or_member\\('
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '(public\\.)?is_household_owner_or_member\\('
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%family.can_access_household(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%family.can_access_household(%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%family.can_manage_household_documents(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%family.can_manage_household_documents(%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%family.is_household_member(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%family.is_household_member(%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%family.is_household_owner(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%family.is_household_owner(%'
      )
  loop
    new_qual := rec.qual;
    new_check := rec.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, 'public.is_data_accessible_to_member(', 'family_private.is_data_accessible_to_member(');
      new_qual := regexp_replace(new_qual, '(^|[^A-Za-z0-9_.])is_data_accessible_to_member\\(', '\1family_private.is_data_accessible_to_member(', 'g');
      new_qual := replace(new_qual, 'public.is_household_owner_or_member(', 'family_private.is_household_owner_or_member(');
      new_qual := regexp_replace(new_qual, '(^|[^A-Za-z0-9_.])is_household_owner_or_member\\(', '\1family_private.is_household_owner_or_member(', 'g');
      new_qual := replace(new_qual, 'family.can_access_household(', 'family_private.can_access_household(');
      new_qual := replace(new_qual, 'family.can_manage_household_documents(', 'family_private.can_manage_household_documents(');
      new_qual := replace(new_qual, 'family.is_household_member(', 'family_private.is_household_member(');
      new_qual := replace(new_qual, 'family.is_household_owner(', 'family_private.is_household_owner(');
    end if;

    if new_check is not null then
      new_check := replace(new_check, 'public.is_data_accessible_to_member(', 'family_private.is_data_accessible_to_member(');
      new_check := regexp_replace(new_check, '(^|[^A-Za-z0-9_.])is_data_accessible_to_member\\(', '\1family_private.is_data_accessible_to_member(', 'g');
      new_check := replace(new_check, 'public.is_household_owner_or_member(', 'family_private.is_household_owner_or_member(');
      new_check := regexp_replace(new_check, '(^|[^A-Za-z0-9_.])is_household_owner_or_member\\(', '\1family_private.is_household_owner_or_member(', 'g');
      new_check := replace(new_check, 'family.can_access_household(', 'family_private.can_access_household(');
      new_check := replace(new_check, 'family.can_manage_household_documents(', 'family_private.can_manage_household_documents(');
      new_check := replace(new_check, 'family.is_household_member(', 'family_private.is_household_member(');
      new_check := replace(new_check, 'family.is_household_owner(', 'family_private.is_household_owner(');
    end if;

    cmd := case rec.polcmd
      when 'r' then 'select'
      when 'a' then 'insert'
      when 'w' then 'update'
      when 'd' then 'delete'
      else 'all'
    end;
    roles_sql := coalesce(nullif(rec.roles_sql, ''), 'public');

    execute format('drop policy if exists %I on %I.%I', rec.policy_name, rec.schema_name, rec.table_name);
    sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      rec.policy_name,
      rec.schema_name,
      rec.table_name,
      case when rec.polpermissive then 'permissive' else 'restrictive' end,
      cmd,
      roles_sql
    );
    if new_qual is not null then
      sql := sql || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      sql := sql || format(' with check (%s)', new_check);
    end if;
    execute sql;
  end loop;
end $$;

do $$
declare
  rec record;
begin
  for rec in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and c.relrowsecurity
      and n.nspname in ('core', 'public')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    execute format(
      'create policy %I on %I.%I for all to anon, authenticated using (false) with check (false)',
      'deny_api_access_by_default',
      rec.schema_name,
      rec.table_name
    );
  end loop;
end $$;

do $$
begin
  if to_regclass('public.brand_tenant_map') is not null then
    alter view public.brand_tenant_map set (security_invoker = true);
  end if;
  if to_regclass('public.family_economy_olivia') is not null then
    alter view public.family_economy_olivia set (security_invoker = true);
  end if;
  if to_regclass('public.family_economy_realtyflow') is not null then
    alter view public.family_economy_realtyflow set (security_invoker = true);
  end if;
  if to_regclass('public.family_economy_mondeo') is not null then
    alter view public.family_economy_mondeo set (security_invoker = true);
  end if;
  if to_regclass('public.family_economy_monthly') is not null then
    alter view public.family_economy_monthly set (security_invoker = true);
  end if;
  if to_regclass('family.economy_monthly') is not null then
    alter view family.economy_monthly set (security_invoker = true);
  end if;
end $$;

alter function public.handle_new_user() set search_path = public, pg_catalog;
alter function family.handle_new_user() set search_path = family, public, pg_catalog;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_data_accessible_to_member(uuid) from public, anon, authenticated;
revoke execute on function public.is_household_owner_or_member(uuid) from public, anon, authenticated;
revoke execute on function public.sync_family_mondeo_kpi_to_business_event() from public, anon, authenticated;

revoke execute on function family.can_access_household(uuid) from public, anon, authenticated;
revoke execute on function family.can_manage_household_documents(uuid) from public, anon, authenticated;
revoke execute on function family.handle_new_user() from public, anon, authenticated;
revoke execute on function family.is_household_adult_or_owner(uuid, uuid) from public, anon, authenticated;
revoke execute on function family.is_household_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function family.is_household_owner(uuid, uuid) from public, anon, authenticated;
revoke execute on function family.sync_user_profile() from public, anon, authenticated;

grant execute on function public.handle_new_user() to service_role;
grant execute on function public.is_data_accessible_to_member(uuid) to service_role;
grant execute on function public.is_household_owner_or_member(uuid) to service_role;
grant execute on function public.sync_family_mondeo_kpi_to_business_event() to service_role;

grant execute on function family.can_access_household(uuid) to service_role;
grant execute on function family.can_manage_household_documents(uuid) to service_role;
grant execute on function family.handle_new_user() to service_role;
grant execute on function family.is_household_adult_or_owner(uuid, uuid) to service_role;
grant execute on function family.is_household_member(uuid, uuid) to service_role;
grant execute on function family.is_household_owner(uuid, uuid) to service_role;
grant execute on function family.sync_user_profile() to service_role;
