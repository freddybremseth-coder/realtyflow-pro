-- Lead Intelligence contact-link gate.
--
-- This migration is intentionally narrow:
-- - it expects the reviewed persistence foundation and runtime-RLS migrations
--   to already be applied
-- - it lets the dedicated runtime role set buyer_profiles.contact_id only
-- - it does not grant contact table access, create contacts, create leads,
--   send email, or start property matching

do $$
declare
  runtime_role constant text := 'realtyflow_lead_intelligence_runtime';
  missing_columns text[];
begin
  if to_regclass('public.buyer_profiles') is null then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_SCHEMA_NOT_READY: public.buyer_profiles is missing';
  end if;

  if to_regclass('public.lead_intelligence_contact_lookup') is null then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_SCHEMA_NOT_READY: contact lookup view is missing';
  end if;

  if not exists (select 1 from pg_roles where rolname = runtime_role) then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_SCHEMA_NOT_READY: runtime role is missing';
  end if;

  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from (
    values
      ('id', 'uuid'),
      ('brand', 'text'),
      ('contact_id', 'uuid'),
      ('status', 'text'),
      ('updated_at', 'timestamp with time zone')
  ) as required(column_name, data_type)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'buyer_profiles'
      and c.column_name = required.column_name
      and c.data_type = required.data_type
  );

  if coalesce(array_length(missing_columns, 1), 0) > 0 then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_SCHEMA_INCOMPATIBLE: public.buyer_profiles columns missing or incompatible: %', missing_columns;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'buyer_profiles'
      and policyname = 'buyer_profiles_runtime_select'
      and roles::text like '%' || runtime_role || '%'
  ) then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_SCHEMA_NOT_READY: buyer profile runtime select policy is missing';
  end if;

  if has_table_privilege(runtime_role, 'public.contacts', 'select') then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: runtime role can read public.contacts directly';
  end if;

  if has_schema_privilege(runtime_role, 'public', 'create') then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: runtime role can create in public schema';
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
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: runtime role has elevated attributes';
  end if;
end $$;

grant update (contact_id) on public.buyer_profiles to realtyflow_lead_intelligence_runtime;

drop policy if exists buyer_profiles_runtime_contact_link on public.buyer_profiles;
create policy buyer_profiles_runtime_contact_link
  on public.buyer_profiles
  for update
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status = 'approved'
    and contact_id is null
  )
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status = 'approved'
    and contact_id is not null
    and exists (
      select 1
      from public.lead_intelligence_contact_lookup contact
      where contact.id = buyer_profiles.contact_id
        and contact.brand = buyer_profiles.brand
    )
  );

comment on policy buyer_profiles_runtime_contact_link on public.buyer_profiles is
  'Allows the Lead Intelligence runtime role to link an approved buyer profile to a same-brand contact already visible through the server-filtered lookup view. No contact rows are modified.';

do $$
declare
  runtime_role constant text := 'realtyflow_lead_intelligence_runtime';
begin
  if not has_column_privilege(runtime_role, 'public.buyer_profiles', 'contact_id', 'update') then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_GRANT_FAILED: runtime role cannot update buyer_profiles.contact_id';
  end if;

  if has_column_privilege(runtime_role, 'public.buyer_profiles', 'summary', 'update')
    or has_column_privilege(runtime_role, 'public.buyer_profiles', 'status', 'update')
    or has_column_privilege(runtime_role, 'public.buyer_profiles', 'brand', 'update')
    or has_column_privilege(runtime_role, 'public.buyer_profiles', 'intake_id', 'update')
  then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: runtime role can update profile columns beyond contact_id';
  end if;

  if has_table_privilege(runtime_role, 'public.buyer_profiles', 'delete') then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: runtime role can delete buyer profiles';
  end if;

  if has_table_privilege(runtime_role, 'public.contacts', 'select') then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: runtime role can read public.contacts directly';
  end if;

  if has_table_privilege('anon', 'public.buyer_profiles', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'public.buyer_profiles', 'select,insert,update,delete')
  then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: browser roles can access buyer_profiles';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where n.nspname = 'public'
      and c.relname = 'buyer_profiles'
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_LINK_PRIVILEGE_DRIFT: PUBLIC can access buyer_profiles';
  end if;
end $$;
