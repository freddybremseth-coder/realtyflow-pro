-- Keep old public Olivia farm duplicates closed; olivia.* is the canonical app schema.

do $migration$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'farm_settings',
    'parcels',
    'harvest_records',
    'farm_expenses',
    'subsidy_income'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      policy_name := 'Deny direct API access to legacy Olivia farm ' || table_name;

      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists %I on public.%I', 'Allow all on ' || table_name, table_name);
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      execute format(
        'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
        policy_name,
        table_name
      );
    end if;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
