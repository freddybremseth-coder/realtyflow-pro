-- Make existing helper/trigger functions deterministic.
-- Supabase flags functions without an explicit search_path because they can
-- resolve unqualified objects differently depending on the caller role.

do $$
declare
  rec record;
  search_path_sql text;
begin
  for rec in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'core', 'family', 'olivia')
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
      )
  loop
    search_path_sql := case rec.schema_name
      when 'core' then 'core, public, family, olivia, extensions, pg_catalog'
      when 'family' then 'family, public, core, olivia, extensions, pg_catalog'
      when 'olivia' then 'olivia, public, core, family, extensions, pg_catalog'
      else 'public, core, family, olivia, extensions, pg_catalog'
    end;

    execute format(
      'alter function %I.%I(%s) set search_path = %s',
      rec.schema_name,
      rec.function_name,
      rec.args,
      search_path_sql
    );
  end loop;
end $$;
