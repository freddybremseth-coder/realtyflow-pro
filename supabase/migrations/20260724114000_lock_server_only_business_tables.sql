-- Lock additional server-only business tables behind service-role routes.
-- These tables are read/written through Next.js API routes, public checkout
-- routes, or cron jobs, so browser roles should not access them directly.

do $$
begin
  if to_regclass('public.advisor_playbooks') is not null then
    alter table public.advisor_playbooks enable row level security;
    drop policy if exists "Allow all on advisor_playbooks" on public.advisor_playbooks;
    create policy "Deny direct API access to advisor playbooks"
      on public.advisor_playbooks for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.book_download_grants') is not null then
    alter table public.book_download_grants enable row level security;
    drop policy if exists "Allow all" on public.book_download_grants;
    create policy "Deny direct API access to book download grants"
      on public.book_download_grants for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.demosites_portal_users') is not null then
    alter table public.demosites_portal_users enable row level security;
    drop policy if exists "Allow all" on public.demosites_portal_users;
    create policy "Deny direct API access to demosites portal users"
      on public.demosites_portal_users for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.import_sources') is not null then
    alter table public.import_sources enable row level security;
    drop policy if exists "Allow all on import_sources" on public.import_sources;
    create policy "Deny direct API access to import sources"
      on public.import_sources for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.kdp_report_imports') is not null then
    alter table public.kdp_report_imports enable row level security;
    drop policy if exists "Allow all on kdp_report_imports" on public.kdp_report_imports;
    create policy "Deny direct API access to KDP report imports"
      on public.kdp_report_imports for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.market_data_snapshots') is not null then
    alter table public.market_data_snapshots enable row level security;
    drop policy if exists "Allow all on market_data_snapshots" on public.market_data_snapshots;
    create policy "Deny direct API access to market data snapshots"
      on public.market_data_snapshots for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.market_reports') is not null then
    alter table public.market_reports enable row level security;
    drop policy if exists "Allow all on market_reports" on public.market_reports;
    create policy "Deny direct API access to market reports"
      on public.market_reports for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.publishing_book_projects') is not null then
    alter table public.publishing_book_projects enable row level security;
    drop policy if exists "Allow all on publishing_book_projects" on public.publishing_book_projects;
    create policy "Deny direct API access to publishing book projects"
      on public.publishing_book_projects for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.publishing_books') is not null then
    alter table public.publishing_books enable row level security;
    drop policy if exists "Allow all on publishing_books" on public.publishing_books;
    create policy "Deny direct API access to publishing books"
      on public.publishing_books for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.publishing_market_snapshots') is not null then
    alter table public.publishing_market_snapshots enable row level security;
    drop policy if exists "Allow all on publishing_market_snapshots" on public.publishing_market_snapshots;
    create policy "Deny direct API access to publishing market snapshots"
      on public.publishing_market_snapshots for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.report_recipients') is not null then
    alter table public.report_recipients enable row level security;
    drop policy if exists "Allow all on report_recipients" on public.report_recipients;
    create policy "Deny direct API access to report recipients"
      on public.report_recipients for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
