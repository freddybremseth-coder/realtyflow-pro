-- Contacts RLS hardening before the Lead Intelligence contact-create gate.
--
-- Production preflight for the contact-create gate found an old CRM policy:
--   "Allow all on contacts" FOR ALL TO public USING (true) WITH CHECK (true)
-- together with direct anon/authenticated write grants. This migration removes
-- those direct browser-role privileges and keeps contact writes server-mediated.
--
-- This migration intentionally does not run the Lead Intelligence contact-create
-- gate. It only hardens public.contacts so that gate can be applied separately.

do $$
declare
  missing_columns text[];
begin
  if to_regclass('public.contacts') is null then
    raise exception 'CONTACTS_RLS_HARDENING_SCHEMA_NOT_READY: public.contacts is missing';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'contacts'
      and c.relkind = 'r'
  ) then
    raise exception 'CONTACTS_RLS_HARDENING_SCHEMA_INCOMPATIBLE: public.contacts is not a base table';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'contacts'
      and c.relrowsecurity
  ) then
    raise exception 'CONTACTS_RLS_HARDENING_SCHEMA_INCOMPATIBLE: public.contacts RLS is not enabled';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'CONTACTS_RLS_HARDENING_SCHEMA_NOT_READY: service_role is missing';
  end if;

  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from (
    values
      ('id'),
      ('brand'),
      ('name'),
      ('email'),
      ('phone'),
      ('pipeline_status'),
      ('source'),
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
    raise exception 'CONTACTS_RLS_HARDENING_SCHEMA_INCOMPATIBLE: public.contacts missing required columns %', missing_columns;
  end if;
end $$;

drop policy if exists "Allow all on contacts" on public.contacts;

revoke all privileges on table public.contacts from public;
revoke all privileges on table public.contacts from anon;
revoke all privileges on table public.contacts from authenticated;

-- Existing CRM, public lead capture, portal, chatbot, and admin routes are
-- server-mediated and use SUPABASE_SERVICE_ROLE_KEY. Keep that backend path
-- working, but do not expose browser roles directly to public.contacts.
grant select, insert, update, delete on table public.contacts to service_role;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contacts'
      and policyname = 'Allow all on contacts'
  ) then
    raise exception 'CONTACTS_RLS_HARDENING_POLICY_DRIFT: open legacy contacts policy still exists';
  end if;

  if has_table_privilege('anon', 'public.contacts', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'public.contacts', 'select,insert,update,delete')
    or has_any_column_privilege('anon', 'public.contacts', 'select,insert,update,references')
    or has_any_column_privilege('authenticated', 'public.contacts', 'select,insert,update,references')
  then
    raise exception 'CONTACTS_RLS_HARDENING_PRIVILEGE_DRIFT: browser roles can access public.contacts directly';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where n.nspname = 'public'
      and c.relname = 'contacts'
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'CONTACTS_RLS_HARDENING_PRIVILEGE_DRIFT: PUBLIC can access public.contacts';
  end if;

  if not has_table_privilege('service_role', 'public.contacts', 'select,insert,update,delete') then
    raise exception 'CONTACTS_RLS_HARDENING_GRANT_FAILED: service_role lacks required contacts access';
  end if;
end $$;
