-- Lead Intelligence runtime membership diagnostic.
--
-- Read-only production preflight helper for Supabase project ereapsfcsqtdmzosgnnn.
-- Do not run this without explicit activation approval. It does not create,
-- alter, grant, revoke, insert, update, or delete anything.
--
-- Purpose:
-- - show role membership direction and PostgreSQL 17 membership options
-- - distinguish admin-only creator metadata from effective privilege risk
-- - prove whether the runtime role can access sensitive/application objects
-- - confirm whether a previous failed activation left runtime objects behind

select jsonb_build_object(
  'session', jsonb_build_object(
    'database', current_database(),
    'user', current_user,
    'schema', current_schema(),
    'server_version', version()
  ),
  'runtime_role', coalesce((
    select jsonb_build_object(
      'exists', true,
      'can_login', rolcanlogin,
      'inherit', rolinherit,
      'bypassrls', rolbypassrls,
      'superuser', rolsuper,
      'createdb', rolcreatedb,
      'createrole', rolcreaterole,
      'connection_limit', rolconnlimit,
      'public_schema_usage', has_schema_privilege('realtyflow_lead_intelligence_runtime', 'public', 'usage'),
      'public_schema_create', has_schema_privilege('realtyflow_lead_intelligence_runtime', 'public', 'create')
    )
    from pg_roles
    where rolname = 'realtyflow_lead_intelligence_runtime'
  ), jsonb_build_object('exists', false)),
  'memberships_runtime_is_member_of', coalesce((
    select jsonb_agg(jsonb_build_object(
      'granted_role', granted_role.rolname,
      'admin_option', m.admin_option,
      'inherit_option', m.inherit_option,
      'set_option', m.set_option,
      'granted_role_superuser', granted_role.rolsuper,
      'granted_role_createdb', granted_role.rolcreatedb,
      'granted_role_createrole', granted_role.rolcreaterole,
      'granted_role_bypassrls', granted_role.rolbypassrls
    ) order by granted_role.rolname)
    from pg_auth_members m
    join pg_roles runtime_role on runtime_role.oid = m.member
    join pg_roles granted_role on granted_role.oid = m.roleid
    where runtime_role.rolname = 'realtyflow_lead_intelligence_runtime'
  ), '[]'::jsonb),
  'memberships_other_roles_are_member_of_runtime', coalesce((
    select jsonb_agg(jsonb_build_object(
      'member_role', member_role.rolname,
      'admin_option', m.admin_option,
      'inherit_option', m.inherit_option,
      'set_option', m.set_option
    ) order by member_role.rolname)
    from pg_auth_members m
    join pg_roles runtime_role on runtime_role.oid = m.roleid
    join pg_roles member_role on member_role.oid = m.member
    where runtime_role.rolname = 'realtyflow_lead_intelligence_runtime'
  ), '[]'::jsonb),
  'runtime_ownership_count', coalesce((
    select (
      (select count(*) from pg_class where relowner = r.oid) +
      (select count(*) from pg_namespace where nspowner = r.oid) +
      (select count(*) from pg_proc where proowner = r.oid) +
      (select count(*) from pg_type where typowner = r.oid)
    )
    from pg_roles r
    where r.rolname = 'realtyflow_lead_intelligence_runtime'
  ), 0),
  'effective_relation_privileges', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', schema_name,
      'relation', relation_name,
      'privilege', privilege_name
    ) order by schema_name, relation_name, privilege_name)
    from (
      select
        n.nspname as schema_name,
        c.relname as relation_name,
        privileges.privilege_name
      from pg_roles runtime_role
      join pg_class c on true
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
      ) privileges(privilege_name)
      where runtime_role.rolname = 'realtyflow_lead_intelligence_runtime'
        and n.nspname in ('public', 'storage', 'auth', 'vault')
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and has_table_privilege(runtime_role.rolname, c.oid, privileges.privilege_name)
    ) relation_privileges
  ), '[]'::jsonb),
  'effective_sequence_privileges', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', schema_name,
      'sequence', sequence_name,
      'privilege', privilege_name
    ) order by schema_name, sequence_name, privilege_name)
    from (
      select
        n.nspname as schema_name,
        c.relname as sequence_name,
        privileges.privilege_name
      from pg_roles runtime_role
      join pg_class c on true
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) privileges(privilege_name)
      where runtime_role.rolname = 'realtyflow_lead_intelligence_runtime'
        and n.nspname in ('public', 'storage', 'auth', 'vault')
        and c.relkind = 'S'
        and has_sequence_privilege(runtime_role.rolname, c.oid, privileges.privilege_name)
    ) sequence_privileges
  ), '[]'::jsonb),
  'runtime_objects', jsonb_build_object(
    'lookup_view_exists', to_regclass('public.lead_intelligence_contact_lookup') is not null,
    'runtime_policy_count', (
      select count(*)::int
      from pg_policies
      where schemaname = 'public'
        and policyname like '%runtime%'
        and tablename in (
          'lead_intake_messages',
          'lead_analysis_runs',
          'buyer_profiles',
          'buyer_profile_criteria',
          'lead_contact_candidates',
          'contacts'
        )
    )
  ),
  'lead_intelligence_row_counts', jsonb_build_object(
    'lead_intake_messages', case when to_regclass('public.lead_intake_messages') is null then null else (select count(*) from public.lead_intake_messages) end,
    'lead_analysis_runs', case when to_regclass('public.lead_analysis_runs') is null then null else (select count(*) from public.lead_analysis_runs) end,
    'buyer_profiles', case when to_regclass('public.buyer_profiles') is null then null else (select count(*) from public.buyer_profiles) end,
    'buyer_profile_criteria', case when to_regclass('public.buyer_profile_criteria') is null then null else (select count(*) from public.buyer_profile_criteria) end,
    'lead_contact_candidates', case when to_regclass('public.lead_contact_candidates') is null then null else (select count(*) from public.lead_contact_candidates) end
  )
) as lead_intelligence_runtime_membership_diagnostic;
