-- Reduce direct PostgREST access on RealtyFlow core tables.
-- Public-facing reads stay on listing tables; writes and sensitive tables go through server APIs.

do $migration$
begin
  if to_regclass('public.leads') is not null then
    execute 'alter table public.leads enable row level security';
    execute 'drop policy if exists "Allow all on leads" on public.leads';
    execute 'drop policy if exists allow_all_leads on public.leads';
    execute 'drop policy if exists "Deny direct API access to leads" on public.leads';
    execute 'create policy "Deny direct API access to leads" on public.leads for all to anon, authenticated using (false) with check (false)';
  end if;

  if to_regclass('public.work_items') is not null then
    execute 'alter table public.work_items enable row level security';
    execute 'drop policy if exists "Allow all on work_items" on public.work_items';
    execute 'drop policy if exists "Deny direct API access to work items" on public.work_items';
    execute 'create policy "Deny direct API access to work items" on public.work_items for all to anon, authenticated using (false) with check (false)';
  end if;

  if to_regclass('public.properties') is not null then
    execute 'alter table public.properties enable row level security';
    execute 'drop policy if exists "Allow all on properties" on public.properties';
    execute 'drop policy if exists allow_all_properties on public.properties';
    execute 'drop policy if exists "Public read properties" on public.properties';
    execute 'drop policy if exists "Deny direct writes to properties" on public.properties';
    execute 'create policy "Public read properties" on public.properties for select to anon, authenticated using (true)';
    execute 'create policy "Deny direct writes to properties" on public.properties for all to anon, authenticated using (false) with check (false)';
  end if;

  if to_regclass('public.land_plots') is not null then
    execute 'alter table public.land_plots enable row level security';
    execute 'drop policy if exists "Allow all on land_plots" on public.land_plots';
    execute 'drop policy if exists "Public read land plots" on public.land_plots';
    execute 'drop policy if exists "Deny direct writes to land plots" on public.land_plots';
    execute 'create policy "Public read land plots" on public.land_plots for select to anon, authenticated using (true)';
    execute 'create policy "Deny direct writes to land plots" on public.land_plots for all to anon, authenticated using (false) with check (false)';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
