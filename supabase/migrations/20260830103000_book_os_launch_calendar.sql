-- Book OS phase 4.1: controlled activation into an internal launch calendar.
-- Activation creates draft calendar items only. It never creates or sends external publications.

create table public.publishing_launch_activations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.publishing_launch_campaigns(id) on delete restrict,
  work_id uuid not null references public.publishing_catalog_works(id) on delete cascade,
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  revision_id uuid not null references public.publishing_catalog_revisions(id) on delete restrict,
  start_date date not null,
  timezone text not null check (length(timezone) between 1 and 64),
  status text not null default 'active' check (status in ('active','paused','cancelled','completed')),
  campaign_fingerprint text not null check (campaign_fingerprint ~ '^[0-9a-f]{64}$'),
  activated_by text not null check (length(trim(activated_by)) between 1 and 160),
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.publishing_launch_activations is 'Book OS 4.1 activation record for an approved campaign; no external publication is implied.';
create index publishing_launch_activations_edition_lookup on public.publishing_launch_activations (edition_id, status, start_date desc);
create unique index publishing_launch_activations_one_active_edition
  on public.publishing_launch_activations (edition_id)
  where status in ('active','paused');
alter table public.publishing_launch_activations enable row level security;
revoke all on table public.publishing_launch_activations from public, anon, authenticated;
grant select, insert, update, delete on table public.publishing_launch_activations to service_role;
create policy "publishing_launch_activations_deny_direct" on public.publishing_launch_activations for all to anon, authenticated using (false) with check (false);

create table public.publishing_launch_calendar_items (
  id uuid primary key default gen_random_uuid(),
  activation_id uuid not null references public.publishing_launch_activations(id) on delete cascade,
  campaign_id uuid not null references public.publishing_launch_campaigns(id) on delete restrict,
  source_item_index integer not null check (source_item_index >= 0),
  channel text not null check (channel in ('facebook','instagram','email','website')),
  content_type text not null check (length(trim(content_type)) between 1 and 120),
  scheduled_for timestamptz not null,
  local_date date not null,
  timezone text not null check (length(timezone) between 1 and 64),
  status text not null default 'draft' check (status in ('draft','ready_for_review','cancelled')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activation_id, source_item_index)
);
comment on table public.publishing_launch_calendar_items is 'Internal review calendar drafts. Rows are not external marketing publications.';
create index publishing_launch_calendar_items_schedule_lookup on public.publishing_launch_calendar_items (activation_id, scheduled_for, channel);
alter table public.publishing_launch_calendar_items enable row level security;
revoke all on table public.publishing_launch_calendar_items from public, anon, authenticated;
grant select, insert, update, delete on table public.publishing_launch_calendar_items to service_role;
create policy "publishing_launch_calendar_items_deny_direct" on public.publishing_launch_calendar_items for all to anon, authenticated using (false) with check (false);

create or replace function public.publishing_activate_launch_campaign(
  p_campaign_id uuid,
  p_start_date date,
  p_timezone text,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.publishing_launch_campaigns%rowtype;
  existing public.publishing_launch_activations%rowtype;
  activation_id uuid;
  calendar_count integer;
begin
  if p_start_date is null or p_start_date < current_date or p_start_date > current_date + 365 then
    raise exception 'Start date must be within the next 365 days';
  end if;
  if nullif(trim(p_timezone), '') is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = trim(p_timezone)) then
    raise exception 'A valid IANA timezone is required';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'Activation actor is required';
  end if;

  select * into selected from public.publishing_launch_campaigns where id = p_campaign_id for update;
  if not found or selected.status <> 'approved' then
    raise exception 'Campaign must be approved before activation';
  end if;
  if not exists (
    select 1 from public.publishing_catalog_revisions
    where id = selected.revision_id and edition_id = selected.edition_id and is_canonical
  ) then
    raise exception 'Campaign revision is no longer canonical';
  end if;
  if cardinality(selected.source_package_ids) <> 4 or (
    select count(distinct channel) from public.publishing_channel_metadata_packages
    where id = any(selected.source_package_ids)
      and edition_id = selected.edition_id
      and revision_id = selected.revision_id
      and status = 'approved'
  ) <> 4 then
    raise exception 'Source metadata is no longer approved';
  end if;
  if not exists (
    select 1 from public.publishing_catalog_assets
    where id = any(selected.source_asset_ids)
      and edition_id = selected.edition_id
      and revision_id = selected.revision_id
      and asset_type = 'epub' and status = 'verified' and is_canonical
  ) or not exists (
    select 1 from public.publishing_catalog_assets
    where id = any(selected.source_asset_ids)
      and edition_id = selected.edition_id
      and asset_type = 'cover' and status = 'verified' and is_canonical
  ) then
    raise exception 'Source assets are no longer canonical';
  end if;

  select * into existing from public.publishing_launch_activations where campaign_id = p_campaign_id;
  if found then
    if existing.start_date <> p_start_date or existing.timezone <> trim(p_timezone) then
      raise exception 'Campaign is already activated with another start date or timezone';
    end if;
    select count(*) into calendar_count from public.publishing_launch_calendar_items where activation_id = existing.id;
    return jsonb_build_object(
      'activation_id', existing.id,
      'campaign_id', p_campaign_id,
      'status', existing.status,
      'draft_count', calendar_count,
      'idempotent', true,
      'external_publications_created', false
    );
  end if;

  insert into public.publishing_launch_activations (
    campaign_id, work_id, edition_id, revision_id, start_date, timezone,
    campaign_fingerprint, activated_by
  ) values (
    selected.id, selected.work_id, selected.edition_id, selected.revision_id,
    p_start_date, trim(p_timezone), selected.plan_fingerprint, trim(p_actor)
  ) returning id into activation_id;

  insert into public.publishing_launch_calendar_items (
    activation_id, campaign_id, source_item_index, channel, content_type,
    scheduled_for, local_date, timezone, payload
  )
  select
    activation_id,
    selected.id,
    item.ordinality::integer - 1,
    item.value->>'channel',
    item.value->>'contentType',
    (
      (p_start_date + (item.value->>'offsetDay')::integer)
      + case item.value->>'channel'
          when 'email' then time '09:00'
          when 'website' then time '10:00'
          when 'facebook' then time '12:00'
          else time '18:00'
        end
    ) at time zone trim(p_timezone),
    p_start_date + (item.value->>'offsetDay')::integer,
    trim(p_timezone),
    item.value
  from jsonb_array_elements(selected.plan->'items') with ordinality as item(value, ordinality)
  order by item.ordinality;

  get diagnostics calendar_count = row_count;
  if calendar_count <> jsonb_array_length(selected.plan->'items') then
    raise exception 'Calendar item count does not match approved campaign';
  end if;

  return jsonb_build_object(
    'activation_id', activation_id,
    'campaign_id', p_campaign_id,
    'status', 'active',
    'draft_count', calendar_count,
    'idempotent', false,
    'external_publications_created', false
  );
end $$;

revoke all on function public.publishing_activate_launch_campaign(uuid,date,text,text) from public, anon, authenticated;
grant execute on function public.publishing_activate_launch_campaign(uuid,date,text,text) to service_role;

notify pgrst, 'reload schema';
