-- Content publications include drafts, schedule state, image URLs, errors, and campaign metadata.
-- Keep all direct browser access behind authenticated server APIs.

do $migration$
begin
  if to_regclass('public.content_publications') is not null then
    execute 'alter table public.content_publications enable row level security';

    execute 'drop policy if exists "Allow all on content_publications" on public.content_publications';
    execute 'drop policy if exists allow_all_content_publications on public.content_publications';
    execute 'drop policy if exists "Deny direct API access to content publications" on public.content_publications';

    execute 'create policy "Deny direct API access to content publications" on public.content_publications for all to anon, authenticated using (false) with check (false)';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
