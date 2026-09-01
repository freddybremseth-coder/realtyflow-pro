-- Book OS phase 4.3: controlled internal channel handoff.
-- Prepared and queued handoffs are internal records only; this migration never creates an external publication.

create table public.publishing_launch_channel_handoffs (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references public.publishing_launch_calendar_items(id) on delete cascade,
  activation_id uuid not null references public.publishing_launch_activations(id) on delete cascade,
  campaign_id uuid not null references public.publishing_launch_campaigns(id) on delete restrict,
  item_version integer not null check (item_version > 0),
  attempt integer not null check (attempt > 0),
  channel text not null check (channel in ('facebook','instagram','email','website')),
  status text not null default 'prepared' check (status in ('prepared','queued','withdrawn')),
  payload_snapshot jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  idempotency_key text not null unique check (length(idempotency_key) = 64),
  prepared_by text not null check (length(trim(prepared_by)) between 1 and 160),
  prepared_at timestamptz not null default now(),
  queued_by text,
  queued_at timestamptz,
  withdrawn_by text,
  withdrawn_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_item_id, item_version, attempt),
  check ((queued_by is null and queued_at is null) or (queued_by is not null and queued_at is not null)),
  check ((withdrawn_by is null and withdrawn_at is null) or (withdrawn_by is not null and withdrawn_at is not null))
);
comment on table public.publishing_launch_channel_handoffs is
  'Internal immutable handoff snapshots. Prepared or queued never means externally published.';
create index publishing_launch_channel_handoffs_activation_fk_idx
  on public.publishing_launch_channel_handoffs (activation_id);
create index publishing_launch_channel_handoffs_campaign_fk_idx
  on public.publishing_launch_channel_handoffs (campaign_id);
create index publishing_launch_channel_handoffs_queue_lookup_idx
  on public.publishing_launch_channel_handoffs (status, channel, prepared_at)
  where status in ('prepared','queued');

alter table public.publishing_launch_channel_handoffs enable row level security;
revoke all on table public.publishing_launch_channel_handoffs from public, anon, authenticated, service_role;
grant select on table public.publishing_launch_channel_handoffs to service_role;
create policy "publishing_launch_channel_handoffs_deny_direct"
  on public.publishing_launch_channel_handoffs for all to anon, authenticated
  using (false) with check (false);

create or replace function public.publishing_prepare_launch_channel_handoff(
  p_item_id uuid,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.publishing_launch_calendar_items%rowtype;
  existing public.publishing_launch_channel_handoffs%rowtype;
  created_id uuid;
  fingerprint text;
  next_attempt integer;
begin
  if nullif(trim(p_actor), '') is null then raise exception 'Handoff actor is required'; end if;
  select * into selected from public.publishing_launch_calendar_items where id = p_item_id for update;
  if not found or selected.status <> 'approved' then
    raise exception 'Only approved calendar content can be prepared for handoff';
  end if;
  if not exists (
    select 1 from public.publishing_launch_activations
    where id = selected.activation_id and status in ('active','paused')
  ) then raise exception 'Launch activation is not active'; end if;

  select * into existing from public.publishing_launch_channel_handoffs
  where calendar_item_id = selected.id and item_version = selected.current_version
    and status in ('prepared','queued')
  order by attempt desc limit 1;
  if found then
    return jsonb_build_object(
      'handoff_id', existing.id, 'status', existing.status, 'item_version', existing.item_version,
      'external_publications_created', false
    );
  end if;

  select coalesce(max(attempt), 0) + 1 into next_attempt
  from public.publishing_launch_channel_handoffs
  where calendar_item_id = selected.id and item_version = selected.current_version;
  fingerprint := encode(extensions.digest(
    convert_to(selected.id::text || ':' || selected.current_version::text || ':' || next_attempt::text || ':' || selected.channel || ':' || selected.payload::text, 'UTF8'),
    'sha256'
  ), 'hex');
  insert into public.publishing_launch_channel_handoffs (
    calendar_item_id, activation_id, campaign_id, item_version, attempt, channel,
    payload_snapshot, idempotency_key, prepared_by
  ) values (
    selected.id, selected.activation_id, selected.campaign_id, selected.current_version, next_attempt, selected.channel,
    selected.payload, fingerprint, trim(p_actor)
  ) returning id into created_id;

  return jsonb_build_object(
    'handoff_id', created_id, 'status', 'prepared', 'item_version', selected.current_version,
    'external_publications_created', false
  );
end $$;

create or replace function public.publishing_decide_launch_channel_handoff(
  p_handoff_id uuid,
  p_decision text,
  p_actor text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.publishing_launch_channel_handoffs%rowtype;
  item public.publishing_launch_calendar_items%rowtype;
  next_status text;
begin
  if p_decision not in ('queue','withdraw') or nullif(trim(p_actor), '') is null then
    raise exception 'Valid handoff decision and actor are required';
  end if;
  if p_decision = 'withdraw' and nullif(trim(p_note), '') is null then
    raise exception 'Withdrawal requires a note';
  end if;
  select * into selected from public.publishing_launch_channel_handoffs where id = p_handoff_id for update;
  if not found or selected.status = 'withdrawn' then raise exception 'Active handoff is required'; end if;
  select * into item from public.publishing_launch_calendar_items where id = selected.calendar_item_id for update;
  if not found or item.status <> 'approved' or item.current_version <> selected.item_version then
    raise exception 'Handoff no longer matches approved content';
  end if;

  if p_decision = 'queue' then
    if selected.status <> 'prepared' then raise exception 'Only prepared handoff can be queued'; end if;
    next_status := 'queued';
    update public.publishing_launch_channel_handoffs
    set status = next_status, queued_by = trim(p_actor), queued_at = now(), updated_at = now()
    where id = selected.id;
  else
    next_status := 'withdrawn';
    update public.publishing_launch_channel_handoffs
    set status = next_status, withdrawn_by = trim(p_actor), withdrawn_at = now(),
        note = nullif(trim(p_note), ''), updated_at = now()
    where id = selected.id;
  end if;

  return jsonb_build_object(
    'handoff_id', selected.id, 'status', next_status, 'item_version', selected.item_version,
    'external_publications_created', false
  );
end $$;

create or replace function public.publishing_launch_block_active_handoff_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' and (new.status <> 'approved' or new.current_version <> old.current_version or new.payload is distinct from old.payload)
    and exists (
      select 1 from public.publishing_launch_channel_handoffs
      where calendar_item_id = old.id and item_version = old.current_version and status in ('prepared','queued')
    ) then
    raise exception 'Withdraw active channel handoff before revising approved content';
  end if;
  return new;
end $$;
create trigger publishing_launch_block_active_handoff_revision
before update on public.publishing_launch_calendar_items
for each row execute function public.publishing_launch_block_active_handoff_revision();

revoke all on function public.publishing_prepare_launch_channel_handoff(uuid,text) from public, anon, authenticated;
revoke all on function public.publishing_decide_launch_channel_handoff(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.publishing_launch_block_active_handoff_revision() from public, anon, authenticated;
grant execute on function public.publishing_prepare_launch_channel_handoff(uuid,text) to service_role;
grant execute on function public.publishing_decide_launch_channel_handoff(uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';
