-- Lead Intelligence contact create gate.
--
-- Allows the dedicated Lead Intelligence runtime role to create a new CRM
-- buyer contact from an already approved buyer profile. This grants INSERT
-- only on the narrow set of public.contacts columns the route writes.
-- It does not grant SELECT, UPDATE, DELETE, lead writes, email writes, or
-- property matching privileges.

do $$
declare
  runtime_role constant text := 'realtyflow_lead_intelligence_runtime';
  missing_columns text[];
begin
  if to_regclass('public.contacts') is null then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_SCHEMA_NOT_READY: public.contacts is missing';
  end if;

  if to_regclass('public.buyer_profiles') is null then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_SCHEMA_NOT_READY: public.buyer_profiles is missing';
  end if;

  if not exists (select 1 from pg_roles where rolname = runtime_role) then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_SCHEMA_NOT_READY: runtime role is missing';
  end if;

  select array_agg(column_name order by column_name)
  into missing_columns
  from (
    values
      ('id'),
      ('name'),
      ('email'),
      ('phone'),
      ('type'),
      ('pipeline_status'),
      ('source'),
      ('brand'),
      ('brand_id'),
      ('created_at'),
      ('updated_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'contacts'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_SCHEMA_INCOMPATIBLE: public.contacts missing required columns %', missing_columns;
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'contacts'
      and c.relrowsecurity
  ) then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_SCHEMA_INCOMPATIBLE: public.contacts RLS is not enabled';
  end if;

  if has_schema_privilege(runtime_role, 'public', 'create') then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_PRIVILEGE_DRIFT: runtime role can create in public schema';
  end if;

  if has_table_privilege(runtime_role, 'public.contacts', 'select')
    or has_table_privilege(runtime_role, 'public.contacts', 'update')
    or has_table_privilege(runtime_role, 'public.contacts', 'delete')
  then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_PRIVILEGE_DRIFT: runtime role already has broad contacts privileges';
  end if;

  if has_table_privilege('anon', 'public.contacts', 'insert,update,delete')
    or has_table_privilege('authenticated', 'public.contacts', 'insert,update,delete')
  then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_PRIVILEGE_DRIFT: browser roles can write public.contacts';
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
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_PRIVILEGE_DRIFT: runtime role has elevated attributes';
  end if;
end $$;

grant insert (
  id,
  name,
  email,
  phone,
  type,
  pipeline_status,
  source,
  brand,
  brand_id,
  created_at,
  updated_at
) on public.contacts to realtyflow_lead_intelligence_runtime;

drop policy if exists contacts_lead_intelligence_runtime_insert on public.contacts;
create policy contacts_lead_intelligence_runtime_insert
  on public.contacts
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and coalesce(brand_id, brand) = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and type = 'buyer'
    and pipeline_status = 'NEW'
    and source = 'lead_intelligence'
  );

comment on policy contacts_lead_intelligence_runtime_insert on public.contacts is
  'Allows Lead Intelligence runtime to insert a new same-brand buyer contact only from the approved contact-create gate.';

do $$
declare
  runtime_role constant text := 'realtyflow_lead_intelligence_runtime';
begin
  if not has_column_privilege(runtime_role, 'public.contacts', 'id', 'insert')
    or not has_column_privilege(runtime_role, 'public.contacts', 'name', 'insert')
    or not has_column_privilege(runtime_role, 'public.contacts', 'brand', 'insert')
  then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_GRANT_FAILED: runtime role cannot insert required contact columns';
  end if;

  if has_table_privilege(runtime_role, 'public.contacts', 'select')
    or has_table_privilege(runtime_role, 'public.contacts', 'update')
    or has_table_privilege(runtime_role, 'public.contacts', 'delete')
  then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_PRIVILEGE_DRIFT: runtime role has contacts privileges beyond insert';
  end if;

  if has_table_privilege(runtime_role, 'public.leads', 'insert')
    or has_table_privilege(runtime_role, 'public.email_messages', 'insert')
  then
    raise exception 'LEAD_INTELLIGENCE_CONTACT_CREATE_PRIVILEGE_DRIFT: runtime role can create leads or email messages';
  end if;
end $$;
