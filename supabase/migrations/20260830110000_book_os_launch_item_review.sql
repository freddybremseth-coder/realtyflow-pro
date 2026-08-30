-- Book OS phase 4.2: versioned editing and explicit review of internal calendar drafts.
-- Item approval remains separate from channel handoff and external publication.

alter table public.publishing_launch_calendar_items
  drop constraint if exists publishing_launch_calendar_items_status_check;
alter table public.publishing_launch_calendar_items
  add constraint publishing_launch_calendar_items_status_check
  check (status in ('draft','ready_for_review','approved','cancelled'));
alter table public.publishing_launch_calendar_items
  add column current_version integer not null default 1 check (current_version > 0),
  add column submitted_by text,
  add column submitted_at timestamptz,
  add column approved_by text,
  add column approved_at timestamptz,
  add constraint publishing_launch_calendar_items_submission_pair
    check ((submitted_by is null and submitted_at is null) or (submitted_by is not null and submitted_at is not null)),
  add constraint publishing_launch_calendar_items_approval_pair
    check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null));

create table public.publishing_launch_calendar_item_versions (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references public.publishing_launch_calendar_items(id) on delete cascade,
  activation_id uuid not null references public.publishing_launch_activations(id) on delete cascade,
  campaign_id uuid not null references public.publishing_launch_campaigns(id) on delete restrict,
  version integer not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by text not null check (length(trim(created_by)) between 1 and 160),
  change_reason text not null check (length(trim(change_reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (calendar_item_id, version)
);
comment on table public.publishing_launch_calendar_item_versions is 'Immutable editorial versions for Book OS launch calendar drafts.';
create index publishing_launch_calendar_item_versions_activation_fk_idx
  on public.publishing_launch_calendar_item_versions (activation_id);
create index publishing_launch_calendar_item_versions_campaign_fk_idx
  on public.publishing_launch_calendar_item_versions (campaign_id);
alter table public.publishing_launch_calendar_item_versions enable row level security;
revoke all on table public.publishing_launch_calendar_item_versions from public, anon, authenticated, service_role;
grant select on table public.publishing_launch_calendar_item_versions to service_role;
create policy "publishing_launch_calendar_item_versions_deny_direct"
  on public.publishing_launch_calendar_item_versions for all to anon, authenticated using (false) with check (false);

create table public.publishing_launch_calendar_item_decisions (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references public.publishing_launch_calendar_items(id) on delete cascade,
  activation_id uuid not null references public.publishing_launch_activations(id) on delete cascade,
  campaign_id uuid not null references public.publishing_launch_campaigns(id) on delete restrict,
  item_version integer not null check (item_version > 0),
  decision text not null check (decision in ('submitted','approved','returned','cancelled')),
  actor text not null check (length(trim(actor)) between 1 and 160),
  note text,
  created_at timestamptz not null default now()
);
comment on table public.publishing_launch_calendar_item_decisions is 'Append-only human review trail; approval does not publish or hand off content.';
create index publishing_launch_calendar_item_decisions_item_lookup
  on public.publishing_launch_calendar_item_decisions (calendar_item_id, created_at desc);
create index publishing_launch_calendar_item_decisions_activation_fk_idx
  on public.publishing_launch_calendar_item_decisions (activation_id);
create index publishing_launch_calendar_item_decisions_campaign_fk_idx
  on public.publishing_launch_calendar_item_decisions (campaign_id);
alter table public.publishing_launch_calendar_item_decisions enable row level security;
revoke all on table public.publishing_launch_calendar_item_decisions from public, anon, authenticated, service_role;
grant select on table public.publishing_launch_calendar_item_decisions to service_role;
create policy "publishing_launch_calendar_item_decisions_deny_direct"
  on public.publishing_launch_calendar_item_decisions for all to anon, authenticated using (false) with check (false);

create or replace function public.publishing_launch_calendar_capture_initial_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.publishing_launch_calendar_item_versions (
    calendar_item_id, activation_id, campaign_id, version, payload, created_by, change_reason
  ) values (
    new.id, new.activation_id, new.campaign_id, 1, new.payload, 'launch_activation', 'Initial approved campaign draft'
  );
  return new;
end $$;

create trigger publishing_launch_calendar_initial_version
after insert on public.publishing_launch_calendar_items
for each row execute function public.publishing_launch_calendar_capture_initial_version();

insert into public.publishing_launch_calendar_item_versions (
  calendar_item_id, activation_id, campaign_id, version, payload, created_by, change_reason, created_at
)
select id, activation_id, campaign_id, 1, payload, 'phase_4_2_backfill', 'Initial activated calendar draft', created_at
from public.publishing_launch_calendar_items
on conflict (calendar_item_id, version) do nothing;

create or replace function public.publishing_edit_launch_calendar_item(
  p_item_id uuid,
  p_payload jsonb,
  p_actor text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.publishing_launch_calendar_items%rowtype;
  next_version integer;
begin
  if nullif(trim(p_actor), '') is null or nullif(trim(p_reason), '') is null then
    raise exception 'Editor and change reason are required';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or nullif(trim(p_payload->>'headline'), '') is null
    or nullif(trim(p_payload->>'body'), '') is null
    or nullif(trim(p_payload->>'purpose'), '') is null
    or nullif(trim(p_payload->>'sourceClaim'), '') is null
    or p_payload->>'cta' not in ('view_book','read_sample','buy_book','browse_series') then
    raise exception 'Complete attributable calendar content is required';
  end if;
  if length(p_payload->>'headline') > 240 or length(p_payload->>'body') > 8000
    or length(p_payload->>'purpose') > 1000 or length(p_payload->>'sourceClaim') > 1000 then
    raise exception 'Calendar content exceeds editorial limits';
  end if;

  select * into selected from public.publishing_launch_calendar_items where id = p_item_id for update;
  if not found or selected.status = 'cancelled' then
    raise exception 'Editable calendar item is required';
  end if;
  if not exists (
    select 1 from public.publishing_launch_activations
    where id = selected.activation_id and status in ('active','paused')
  ) then
    raise exception 'Launch activation is not editable';
  end if;
  if p_payload->>'channel' <> selected.channel
    or p_payload->>'contentType' <> selected.content_type
    or p_payload->>'offsetDay' is distinct from selected.payload->>'offsetDay' then
    raise exception 'Channel, content type and campaign day cannot be changed here';
  end if;

  next_version := selected.current_version + 1;
  insert into public.publishing_launch_calendar_item_versions (
    calendar_item_id, activation_id, campaign_id, version, payload, created_by, change_reason
  ) values (
    selected.id, selected.activation_id, selected.campaign_id, next_version,
    p_payload, trim(p_actor), trim(p_reason)
  );
  update public.publishing_launch_calendar_items
  set payload = p_payload,
      current_version = next_version,
      status = 'draft',
      submitted_by = null,
      submitted_at = null,
      approved_by = null,
      approved_at = null,
      updated_at = now()
  where id = selected.id;

  return jsonb_build_object(
    'calendar_item_id', selected.id,
    'version', next_version,
    'status', 'draft',
    'external_publications_created', false
  );
end $$;

create or replace function public.publishing_decide_launch_calendar_item(
  p_item_id uuid,
  p_decision text,
  p_actor text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.publishing_launch_calendar_items%rowtype;
  next_status text;
begin
  if p_decision not in ('submitted','approved','returned','cancelled') or nullif(trim(p_actor), '') is null then
    raise exception 'Valid item decision and actor are required';
  end if;
  if p_decision in ('returned','cancelled') and nullif(trim(p_note), '') is null then
    raise exception 'Return and cancellation require a note';
  end if;
  select * into selected from public.publishing_launch_calendar_items where id = p_item_id for update;
  if not found or selected.status = 'cancelled' then
    raise exception 'Reviewable calendar item is required';
  end if;
  if not exists (
    select 1 from public.publishing_launch_activations
    where id = selected.activation_id and status in ('active','paused')
  ) then
    raise exception 'Launch activation is not reviewable';
  end if;

  if p_decision = 'submitted' then
    if selected.status <> 'draft' then raise exception 'Only a draft can be submitted'; end if;
    next_status := 'ready_for_review';
    update public.publishing_launch_calendar_items
    set status = next_status, submitted_by = trim(p_actor), submitted_at = now(),
        approved_by = null, approved_at = null, updated_at = now()
    where id = selected.id;
  elsif p_decision = 'approved' then
    if selected.status <> 'ready_for_review' then raise exception 'Only submitted content can be approved'; end if;
    next_status := 'approved';
    update public.publishing_launch_calendar_items
    set status = next_status, approved_by = trim(p_actor), approved_at = now(), updated_at = now()
    where id = selected.id;
  elsif p_decision = 'returned' then
    if selected.status not in ('ready_for_review','approved') then raise exception 'Only reviewed content can be returned'; end if;
    next_status := 'draft';
    update public.publishing_launch_calendar_items
    set status = next_status, submitted_by = null, submitted_at = null,
        approved_by = null, approved_at = null, updated_at = now()
    where id = selected.id;
  else
    next_status := 'cancelled';
    update public.publishing_launch_calendar_items
    set status = next_status, approved_by = null, approved_at = null, updated_at = now()
    where id = selected.id;
  end if;

  insert into public.publishing_launch_calendar_item_decisions (
    calendar_item_id, activation_id, campaign_id, item_version, decision, actor, note
  ) values (
    selected.id, selected.activation_id, selected.campaign_id, selected.current_version,
    p_decision, trim(p_actor), nullif(trim(p_note), '')
  );

  return jsonb_build_object(
    'calendar_item_id', selected.id,
    'version', selected.current_version,
    'status', next_status,
    'decision', p_decision,
    'external_publications_created', false
  );
end $$;

revoke insert, update, delete, truncate, references, trigger
  on table public.publishing_launch_calendar_items from service_role;
revoke all on function public.publishing_launch_calendar_capture_initial_version() from public, anon, authenticated;
revoke all on function public.publishing_edit_launch_calendar_item(uuid,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.publishing_decide_launch_calendar_item(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.publishing_edit_launch_calendar_item(uuid,jsonb,text,text) to service_role;
grant execute on function public.publishing_decide_launch_calendar_item(uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';
