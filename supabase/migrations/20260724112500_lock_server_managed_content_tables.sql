-- Restrict server-managed tables to internal service-role routes.
-- Public website posts keep their published-read policy; all writes stay server-side.

do $$
begin
  if to_regclass('public.social_channels') is not null then
    alter table public.social_channels enable row level security;
    drop policy if exists "Allow all on social_channels" on public.social_channels;
    drop policy if exists "service role full access" on public.social_channels;
    create policy "Deny direct API access to social channels"
      on public.social_channels for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.content_generations') is not null then
    alter table public.content_generations enable row level security;
    drop policy if exists "allow_all_content_generations" on public.content_generations;
    drop policy if exists "Allow all for authenticated" on public.content_generations;
    create policy "Deny direct API access to content generations"
      on public.content_generations for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.market_insights') is not null then
    alter table public.market_insights enable row level security;
    drop policy if exists "Service role full access" on public.market_insights;
    create policy "Deny direct API access to market insights"
      on public.market_insights for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.website_posts') is not null then
    alter table public.website_posts enable row level security;
    drop policy if exists "service role manages website posts" on public.website_posts;
    create policy "Deny direct API writes to website posts"
      on public.website_posts for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.automation_logs') is not null then
    alter table public.automation_logs enable row level security;
    drop policy if exists "Allow all on automation_logs" on public.automation_logs;
    drop policy if exists "Allow all for authenticated" on public.automation_logs;
    create policy "Deny direct API access to automation logs"
      on public.automation_logs for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.automation_rules') is not null then
    alter table public.automation_rules enable row level security;
    drop policy if exists "Allow all on automation_rules" on public.automation_rules;
    create policy "Deny direct API access to automation rules"
      on public.automation_rules for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.automation_runs') is not null then
    alter table public.automation_runs enable row level security;
    drop policy if exists "Allow all on automation_runs" on public.automation_runs;
    create policy "Deny direct API access to automation runs"
      on public.automation_runs for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
