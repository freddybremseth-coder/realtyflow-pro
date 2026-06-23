-- Lead Intelligence saved-profile actions.
--
-- Adds a narrow archive gate for approved/draft buyer profiles. This is a
-- soft-delete only: profiles are marked archived and remain available for audit.
-- No contact, lead, email, property matching, shortlist, or presentation rows
-- are created or deleted by this migration.

do $$
declare
  runtime_role constant text := 'realtyflow_lead_intelligence_runtime';
begin
  if to_regclass('public.buyer_profiles') is null then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_SCHEMA_NOT_READY: public.buyer_profiles is missing';
  end if;

  if not exists (select 1 from pg_roles where rolname = runtime_role) then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_SCHEMA_NOT_READY: runtime role is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'buyer_profiles'
      and column_name = 'status'
      and data_type = 'text'
      and is_nullable = 'NO'
  ) then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_SCHEMA_INCOMPATIBLE: buyer_profiles.status is missing or incompatible';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'buyer_profiles'
      and policyname = 'buyer_profiles_runtime_select'
      and roles::text like '%' || runtime_role || '%'
  ) then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_SCHEMA_NOT_READY: buyer profile runtime select policy is missing';
  end if;

  if has_table_privilege(runtime_role, 'public.contacts', 'select') then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_PRIVILEGE_DRIFT: runtime role can read public.contacts directly';
  end if;

  if has_schema_privilege(runtime_role, 'public', 'create') then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_PRIVILEGE_DRIFT: runtime role can create in public schema';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname = runtime_role
      and (
        rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolinherit
        or rolbypassrls
      )
  ) then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_PRIVILEGE_DRIFT: runtime role has elevated attributes';
  end if;
end $$;

grant update (status) on public.buyer_profiles to realtyflow_lead_intelligence_runtime;

drop policy if exists buyer_profiles_runtime_archive on public.buyer_profiles;
create policy buyer_profiles_runtime_archive
  on public.buyer_profiles
  for update
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status in ('draft', 'approved')
  )
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status = 'archived'
  );

comment on policy buyer_profiles_runtime_archive on public.buyer_profiles is
  'Allows the Lead Intelligence runtime role to soft-delete a same-brand buyer profile by setting status=archived. No hard delete is granted.';

do $$
declare
  runtime_role constant text := 'realtyflow_lead_intelligence_runtime';
begin
  if not has_column_privilege(runtime_role, 'public.buyer_profiles', 'status', 'update') then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_GRANT_FAILED: runtime role cannot update buyer_profiles.status';
  end if;

  if has_column_privilege(runtime_role, 'public.buyer_profiles', 'summary', 'update')
    or has_column_privilege(runtime_role, 'public.buyer_profiles', 'brand', 'update')
    or has_column_privilege(runtime_role, 'public.buyer_profiles', 'intake_id', 'update')
  then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_PRIVILEGE_DRIFT: runtime role can update profile columns beyond approved gates';
  end if;

  if has_table_privilege(runtime_role, 'public.buyer_profiles', 'delete') then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_PRIVILEGE_DRIFT: runtime role can delete buyer profiles';
  end if;

  if has_table_privilege(runtime_role, 'public.contacts', 'select') then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_PRIVILEGE_DRIFT: runtime role can read public.contacts directly';
  end if;

  if has_table_privilege('anon', 'public.buyer_profiles', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'public.buyer_profiles', 'select,insert,update,delete')
  then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_ACTIONS_PRIVILEGE_DRIFT: browser roles can access buyer_profiles';
  end if;
end $$;
