-- Book OS phase 4.4: auditable readiness checks for queued internal channel handoffs.
-- A ready preflight remains internal and never schedules, sends or publishes content.

create table public.publishing_launch_channel_preflights (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.publishing_launch_channel_handoffs(id) on delete cascade,
  calendar_item_id uuid not null references public.publishing_launch_calendar_items(id) on delete cascade,
  run_number integer not null check (run_number > 0),
  status text not null check (status in ('ready','blocked')),
  checks jsonb not null check (jsonb_typeof(checks) = 'array'),
  blocker_codes text[] not null default '{}',
  evaluated_by text not null check (length(trim(evaluated_by)) between 1 and 160),
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (handoff_id, run_number)
);
comment on table public.publishing_launch_channel_preflights is
  'Immutable Book OS channel-readiness snapshots. Ready does not authorize external publication.';
create index publishing_launch_channel_preflights_item_fk_idx
  on public.publishing_launch_channel_preflights (calendar_item_id);
create index publishing_launch_channel_preflights_latest_idx
  on public.publishing_launch_channel_preflights (handoff_id, run_number desc);
alter table public.publishing_launch_channel_preflights enable row level security;
revoke all on table public.publishing_launch_channel_preflights from public, anon, authenticated, service_role;
grant select on table public.publishing_launch_channel_preflights to service_role;
create policy "publishing_launch_channel_preflights_deny_direct"
  on public.publishing_launch_channel_preflights for all to anon, authenticated
  using (false) with check (false);

create or replace function public.publishing_run_launch_channel_preflight(
  p_handoff_id uuid,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  handoff public.publishing_launch_channel_handoffs%rowtype;
  item public.publishing_launch_calendar_items%rowtype;
  activation public.publishing_launch_activations%rowtype;
  next_run integer;
  connection_ready boolean := false;
  content_ready boolean := false;
  schedule_ready boolean := false;
  cover_ready boolean := true;
  approval_ready boolean := false;
  queue_ready boolean := false;
  blockers text[] := '{}';
  result_status text;
  result_checks jsonb;
  result_id uuid;
begin
  if nullif(trim(p_actor), '') is null then raise exception 'Preflight actor is required'; end if;
  select * into handoff from public.publishing_launch_channel_handoffs where id = p_handoff_id for update;
  if not found or handoff.status = 'withdrawn' then raise exception 'Active channel handoff is required'; end if;
  select * into item from public.publishing_launch_calendar_items where id = handoff.calendar_item_id;
  select * into activation from public.publishing_launch_activations where id = handoff.activation_id;

  queue_ready := handoff.status = 'queued';
  approval_ready := item.status = 'approved' and item.current_version = handoff.item_version;
  content_ready := nullif(trim(handoff.payload_snapshot->>'headline'), '') is not null
    and nullif(trim(handoff.payload_snapshot->>'body'), '') is not null
    and nullif(trim(handoff.payload_snapshot->>'purpose'), '') is not null
    and nullif(trim(handoff.payload_snapshot->>'sourceClaim'), '') is not null
    and handoff.payload_snapshot->>'cta' in ('view_book','read_sample','buy_book','browse_series')
    and (handoff.channel <> 'instagram' or length(handoff.payload_snapshot->>'body') <= 2200);
  schedule_ready := item.scheduled_for > now() and activation.status in ('active','paused');

  if handoff.channel in ('facebook','instagram') then
    select exists (
      select 1 from public.social_channels
      where brand_id in ('freddypublishing','freddy_publishing') and platform = handoff.channel and is_active
    ) into connection_ready;
    select exists (
      select 1 from public.publishing_catalog_assets
      where edition_id = activation.edition_id and asset_type = 'cover' and status = 'verified' and is_canonical
        and (external_url is not null or storage_path is not null)
    ) into cover_ready;
  elsif handoff.channel = 'email' then
    select exists (
      select 1 from public.social_channels
      where brand_id in ('freddypublishing','freddy_publishing') and platform = 'gmail' and is_active
    ) into connection_ready;
  else
    select exists (
      select 1 from public.brand_settings
      where brand_id in ('freddypublishing','freddy_publishing')
        and coalesce(settings->>'website_url', settings->>'website', settings->>'domain', '') ilike '%books.freddybremseth.com%'
    ) into connection_ready;
  end if;

  if not queue_ready then blockers := array_append(blockers, 'handoff_not_queued'); end if;
  if not approval_ready then blockers := array_append(blockers, 'approval_or_version_stale'); end if;
  if not connection_ready then blockers := array_append(blockers, 'channel_connection_missing'); end if;
  if not content_ready then blockers := array_append(blockers, 'channel_content_invalid'); end if;
  if not schedule_ready then blockers := array_append(blockers, 'schedule_not_future'); end if;
  if not cover_ready then blockers := array_append(blockers, 'canonical_cover_missing'); end if;
  result_status := case when cardinality(blockers) = 0 then 'ready' else 'blocked' end;
  result_checks := jsonb_build_array(
    jsonb_build_object('code','handoff_queued','passed',queue_ready),
    jsonb_build_object('code','approval_current','passed',approval_ready),
    jsonb_build_object('code','channel_connected','passed',connection_ready),
    jsonb_build_object('code','content_valid','passed',content_ready),
    jsonb_build_object('code','schedule_future','passed',schedule_ready),
    jsonb_build_object('code','cover_ready','passed',cover_ready)
  );
  select coalesce(max(run_number),0)+1 into next_run
  from public.publishing_launch_channel_preflights where handoff_id = handoff.id;
  insert into public.publishing_launch_channel_preflights (
    handoff_id, calendar_item_id, run_number, status, checks, blocker_codes, evaluated_by
  ) values (
    handoff.id, handoff.calendar_item_id, next_run, result_status, result_checks, blockers, trim(p_actor)
  ) returning id into result_id;

  return jsonb_build_object(
    'preflight_id', result_id, 'handoff_id', handoff.id, 'run_number', next_run,
    'status', result_status, 'checks', result_checks, 'blocker_codes', blockers,
    'external_publications_created', false
  );
end $$;

revoke all on function public.publishing_run_launch_channel_preflight(uuid,text) from public, anon, authenticated;
grant execute on function public.publishing_run_launch_channel_preflight(uuid,text) to service_role;

notify pgrst, 'reload schema';
