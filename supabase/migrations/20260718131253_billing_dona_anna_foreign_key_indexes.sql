-- PostgreSQL does not automatically index referencing foreign-key columns.
-- Add a covering index for every new billing/commerce/inventory/integration
-- foreign key that is not already the leading part of a valid index.

do $$
declare
  foreign_key record;
  column_names text[];
  quoted_columns text;
  index_name text;
begin
  for foreign_key in
    select
      constraint_row.oid,
      constraint_row.conrelid,
      constraint_row.conname,
      constraint_row.conkey,
      namespace_row.nspname as schema_name,
      table_row.relname as table_name
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where constraint_row.contype = 'f'
      and (
        namespace_row.nspname in ('commerce', 'inventory', 'integrations')
        or (
          namespace_row.nspname = 'public'
          and table_row.relname like 'billing\_%' escape '\'
        )
      )
  loop
    if exists (
      select 1
      from pg_index index_row
      where index_row.indrelid = foreign_key.conrelid
        and index_row.indisvalid
        and (
          select array_agg(key_attnum order by ordinality)
          from unnest(index_row.indkey::smallint[]) with ordinality as keys(key_attnum, ordinality)
          where ordinality <= cardinality(foreign_key.conkey)
        ) = foreign_key.conkey
    ) then
      continue;
    end if;

    select
      array_agg(attribute_row.attname order by key_row.ordinality),
      string_agg(format('%I', attribute_row.attname), ', ' order by key_row.ordinality)
    into column_names, quoted_columns
    from unnest(foreign_key.conkey) with ordinality as key_row(attnum, ordinality)
    join pg_attribute attribute_row
      on attribute_row.attrelid = foreign_key.conrelid
     and attribute_row.attnum = key_row.attnum;

    index_name := left(
      foreign_key.table_name || '_' || array_to_string(column_names, '_') || '_fk_idx',
      52
    ) || '_' || substr(md5(foreign_key.conname), 1, 8);

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      foreign_key.schema_name,
      foreign_key.table_name,
      quoted_columns
    );
  end loop;
end;
$$;
