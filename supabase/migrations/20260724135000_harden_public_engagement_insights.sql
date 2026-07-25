-- Engagement history is now served through authenticated server APIs.
-- Prevent direct reads from public browser clients.

do $migration$
begin
  if to_regclass('public.engagement_snapshots') is not null then
    execute 'alter table public.engagement_snapshots enable row level security';
    execute 'drop policy if exists "Public can read engagement snapshots" on public.engagement_snapshots';
    execute 'drop policy if exists "Deny direct API access to engagement snapshots" on public.engagement_snapshots';
    execute 'create policy "Deny direct API access to engagement snapshots" on public.engagement_snapshots for all to anon, authenticated using (false) with check (false)';
  end if;

  if to_regclass('public.scheduling_insights') is not null then
    execute 'alter table public.scheduling_insights enable row level security';
    execute 'drop policy if exists "Public can read scheduling insights" on public.scheduling_insights';
    execute 'drop policy if exists "Deny direct API access to scheduling insights" on public.scheduling_insights';
    execute 'create policy "Deny direct API access to scheduling insights" on public.scheduling_insights for all to anon, authenticated using (false) with check (false)';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
