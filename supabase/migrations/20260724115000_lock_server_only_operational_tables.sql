-- Lock server-managed operational tables while preserving intended public reads.

do $$
begin
  if to_regclass('public.campaigns') is not null then
    alter table public.campaigns enable row level security;
    drop policy if exists "Allow all on campaigns" on public.campaigns;
    create policy "Deny direct API access to campaigns"
      on public.campaigns for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.genre_images') is not null then
    alter table public.genre_images enable row level security;
    drop policy if exists "genre_images_delete_all" on public.genre_images;
    drop policy if exists "genre_images_insert_all" on public.genre_images;
    create policy "Deny direct API writes to genre images"
      on public.genre_images for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.growth_actions') is not null then
    alter table public.growth_actions enable row level security;
    drop policy if exists "Allow all on growth_actions" on public.growth_actions;
    create policy "Deny direct API access to growth actions"
      on public.growth_actions for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.growth_cycles') is not null then
    alter table public.growth_cycles enable row level security;
    drop policy if exists "Allow all on growth_cycles" on public.growth_cycles;
    create policy "Deny direct API access to growth cycles"
      on public.growth_cycles for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.growth_insights') is not null then
    alter table public.growth_insights enable row level security;
    drop policy if exists "Allow all on growth_insights" on public.growth_insights;
    create policy "Deny direct API access to growth insights"
      on public.growth_insights for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.image_library') is not null then
    alter table public.image_library enable row level security;
    drop policy if exists "allow_all_image_library" on public.image_library;
    create policy "Deny direct API access to image library"
      on public.image_library for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.lead_magnets') is not null then
    alter table public.lead_magnets enable row level security;
    drop policy if exists "Allow all on lead_magnets" on public.lead_magnets;
    create policy "Deny direct API access to lead magnets"
      on public.lead_magnets for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.lead_nurture_events') is not null then
    alter table public.lead_nurture_events enable row level security;
    drop policy if exists "nurture_events_rw" on public.lead_nurture_events;
    create policy "Deny direct API access to lead nurture events"
      on public.lead_nurture_events for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.marketing_notifications') is not null then
    alter table public.marketing_notifications enable row level security;
    drop policy if exists "allow_all_marketing_notifications" on public.marketing_notifications;
    create policy "Deny direct API access to marketing notifications"
      on public.marketing_notifications for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.modules') is not null then
    alter table public.modules enable row level security;
    drop policy if exists "allow_all_modules" on public.modules;
    create policy "Deny direct API access to modules"
      on public.modules for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.official_market_stats') is not null then
    alter table public.official_market_stats enable row level security;
    drop policy if exists "Allow all on official_market_stats" on public.official_market_stats;
    create policy "Deny direct API access to official market stats"
      on public.official_market_stats for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.pipeline_runs') is not null then
    alter table public.pipeline_runs enable row level security;
    drop policy if exists "allow_all_pipeline_runs" on public.pipeline_runs;
    create policy "Deny direct API access to pipeline runs"
      on public.pipeline_runs for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.property_scan_runs') is not null then
    alter table public.property_scan_runs enable row level security;
    drop policy if exists "Allow all on property_scan_runs" on public.property_scan_runs;
    create policy "Deny direct API access to property scan runs"
      on public.property_scan_runs for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.revenue_events') is not null then
    alter table public.revenue_events enable row level security;
    drop policy if exists "revenue_events_authenticated_rw" on public.revenue_events;
    create policy "Deny direct API access to revenue events"
      on public.revenue_events for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.scanned_properties') is not null then
    alter table public.scanned_properties enable row level security;
    drop policy if exists "Allow all on scanned_properties" on public.scanned_properties;
    create policy "Deny direct API access to scanned properties"
      on public.scanned_properties for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.songs') is not null then
    alter table public.songs enable row level security;
    drop policy if exists "Allow all on songs" on public.songs;
    drop policy if exists "allow_all_songs" on public.songs;
    create policy "Deny direct API access to songs"
      on public.songs for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.youtube_videos') is not null then
    alter table public.youtube_videos enable row level security;
    drop policy if exists "allow_all_youtube_videos" on public.youtube_videos;
    drop policy if exists "Allow all for authenticated" on public.youtube_videos;
    create policy "Deny direct API access to YouTube videos"
      on public.youtube_videos for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
