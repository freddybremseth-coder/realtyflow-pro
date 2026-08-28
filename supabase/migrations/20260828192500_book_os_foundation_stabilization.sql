-- RealtyFlow Book OS phase 0A: stop KDP work-item amplification and harden
-- server-managed Book Growth data. Historical work items are never deleted.

do $$
begin
  if to_regclass('public.work_items') is null then
    return;
  end if;

  -- Preserve the most actionable/recent row for each book and action. Mark all
  -- other open rows as cancelled and retain the winner in audit metadata.
  with ranked as (
    select
      wi.id,
      first_value(wi.id) over (
        partition by wi.metadata->>'book_id', wi.metadata->>'action_type'
        order by
          case wi.status
            when 'REVIEW' then 1
            when 'IN_PROGRESS' then 2
            else 3
          end,
          wi.updated_at desc nulls last,
          wi.created_at desc nulls last,
          wi.id desc
      ) as keeper_id,
      row_number() over (
        partition by wi.metadata->>'book_id', wi.metadata->>'action_type'
        order by
          case wi.status
            when 'REVIEW' then 1
            when 'IN_PROGRESS' then 2
            else 3
          end,
          wi.updated_at desc nulls last,
          wi.created_at desc nulls last,
          wi.id desc
      ) as row_number
    from public.work_items wi
    where wi.source_type = 'kdp'
      and wi.status in ('TO_DO', 'IN_PROGRESS', 'REVIEW')
      and wi.metadata->>'loop' = 'publishing_growth_v1'
      and nullif(wi.metadata->>'book_id', '') is not null
      and nullif(wi.metadata->>'action_type', '') is not null
  )
  update public.work_items wi
  set
    status = 'CANCELLED',
    updated_at = now(),
    metadata = coalesce(wi.metadata, '{}'::jsonb) || jsonb_build_object(
      'book_os_rollup', jsonb_build_object(
        'rolled_up_at', now(),
        'reason', 'duplicate_open_growth_action',
        'superseded_by', ranked.keeper_id::text
      )
    )
  from ranked
  where wi.id = ranked.id
    and ranked.row_number > 1;

  -- Convert every retained legacy date-based source id to the canonical key.
  update public.work_items wi
  set
    source_id = 'growthloop:' || (wi.metadata->>'book_id') || ':' || (wi.metadata->>'action_type'),
    updated_at = now(),
    metadata = coalesce(wi.metadata, '{}'::jsonb) || jsonb_build_object(
      'book_os_rollup', jsonb_build_object(
        'rolled_up_at', now(),
        'reason', 'canonical_open_growth_action'
      )
    )
  where wi.source_type = 'kdp'
    and wi.status in ('TO_DO', 'IN_PROGRESS', 'REVIEW')
    and wi.metadata->>'loop' = 'publishing_growth_v1'
    and nullif(wi.metadata->>'book_id', '') is not null
    and nullif(wi.metadata->>'action_type', '') is not null;

  execute $index$
    create unique index work_items_book_growth_open_action_unique
      on public.work_items ((metadata->>'book_id'), (metadata->>'action_type'))
      where source_type = 'kdp'
        and status in ('TO_DO', 'IN_PROGRESS', 'REVIEW')
        and metadata->>'loop' = 'publishing_growth_v1'
        and nullif(metadata->>'book_id', '') is not null
        and nullif(metadata->>'action_type', '') is not null
  $index$;
exception
  when duplicate_table then
    null;
end $$;

-- Book Growth is an internal control plane. Keep RLS and make its server-only
-- access model explicit for both current and future Data API grant behaviour.
do $$
declare
  table_name text;
  policy_name constant text := 'Deny direct API access to Book OS data';
  tables constant text[] := array[
    'book_ad_search_terms',
    'book_channel_metadata',
    'book_growth_apply_log',
    'book_growth_asin_candidates',
    'book_growth_channel_metadata',
    'book_growth_channel_metadata_apply_log',
    'book_growth_channel_metadata_candidates',
    'book_growth_edition_language_apply_log',
    'book_growth_edition_language_candidates',
    'book_growth_events',
    'book_growth_experiments',
    'book_growth_learning_rules',
    'book_growth_metrics',
    'book_growth_recommendations',
    'book_growth_search_terms',
    'book_growth_work_members',
    'book_growth_work_merge_candidates',
    'book_growth_work_merge_log',
    'book_growth_works'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      policy_name,
      table_name
    );
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.book_growth_apply_channel_metadata_candidate(uuid,text)') is not null then
    alter function public.book_growth_apply_channel_metadata_candidate(uuid,text) set search_path = '';
    revoke execute on function public.book_growth_apply_channel_metadata_candidate(uuid,text) from public, anon, authenticated;
    grant execute on function public.book_growth_apply_channel_metadata_candidate(uuid,text) to service_role;
  end if;

  if to_regprocedure('public.book_set_updated_at()') is not null then
    alter function public.book_set_updated_at() set search_path = pg_catalog;
  end if;
end $$;

notify pgrst, 'reload schema';
