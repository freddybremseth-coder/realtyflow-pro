-- Book OS phase 4.6: explicit internal release authorization after a ready preflight.
-- Approved release candidates are not schedules, jobs or external publications.

create table public.publishing_launch_release_candidates (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.publishing_launch_channel_handoffs(id) on delete cascade,
  preflight_id uuid not null unique references public.publishing_launch_channel_preflights(id) on delete restrict,
  calendar_item_id uuid not null references public.publishing_launch_calendar_items(id) on delete cascade,
  item_version integer not null check (item_version > 0),
  channel text not null check (channel in ('facebook','instagram','email','website')),
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','revoked','stale')),
  payload_snapshot jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  scheduled_for_snapshot timestamptz not null,
  requested_by text not null check (length(trim(requested_by)) between 1 and 160),
  requested_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  revocation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null)),
  check ((revoked_by is null and revoked_at is null) or (revoked_by is not null and revoked_at is not null))
);
comment on table public.publishing_launch_release_candidates is
  'Internal final approvals only. Approved never means scheduled, sent or externally published.';
create index publishing_launch_release_candidates_handoff_idx
  on public.publishing_launch_release_candidates (handoff_id, created_at desc);
create index publishing_launch_release_candidates_item_fk_idx
  on public.publishing_launch_release_candidates (calendar_item_id);
alter table public.publishing_launch_release_candidates enable row level security;
revoke all on table public.publishing_launch_release_candidates from public, anon, authenticated, service_role;
grant select on table public.publishing_launch_release_candidates to service_role;
create policy "publishing_launch_release_candidates_deny_direct"
  on public.publishing_launch_release_candidates for all to anon, authenticated using (false) with check (false);

create or replace function public.publishing_prepare_launch_release_candidate(p_handoff_id uuid, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare handoff public.publishing_launch_channel_handoffs%rowtype;
  item public.publishing_launch_calendar_items%rowtype;
  preflight public.publishing_launch_channel_preflights%rowtype;
  existing public.publishing_launch_release_candidates%rowtype; created_id uuid;
begin
  if nullif(trim(p_actor),'') is null then raise exception 'Release actor is required'; end if;
  select * into handoff from public.publishing_launch_channel_handoffs where id=p_handoff_id for update;
  if not found or handoff.status <> 'queued' then raise exception 'Queued channel handoff is required'; end if;
  select * into item from public.publishing_launch_calendar_items where id=handoff.calendar_item_id;
  if not found or item.status <> 'approved' or item.current_version <> handoff.item_version or item.scheduled_for <= now() then
    raise exception 'Current approved future calendar content is required';
  end if;
  select * into preflight from public.publishing_launch_channel_preflights
    where handoff_id=handoff.id order by run_number desc limit 1;
  if not found or preflight.status <> 'ready' then raise exception 'Latest channel preflight must be ready'; end if;
  select * into existing from public.publishing_launch_release_candidates where preflight_id=preflight.id;
  if found then return jsonb_build_object('release_id',existing.id,'status',existing.status,'external_publications_created',false); end if;
  insert into public.publishing_launch_release_candidates
    (handoff_id,preflight_id,calendar_item_id,item_version,channel,payload_snapshot,scheduled_for_snapshot,requested_by)
  values (handoff.id,preflight.id,item.id,handoff.item_version,handoff.channel,handoff.payload_snapshot,item.scheduled_for,trim(p_actor))
  returning id into created_id;
  return jsonb_build_object('release_id',created_id,'status','pending_approval','external_publications_created',false);
end $$;

create or replace function public.publishing_decide_launch_release_candidate(
  p_release_id uuid, p_decision text, p_actor text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected public.publishing_launch_release_candidates%rowtype;
  handoff public.publishing_launch_channel_handoffs%rowtype;
  item public.publishing_launch_calendar_items%rowtype;
  latest_preflight_id uuid; latest_preflight_status text; next_status text;
begin
  if p_decision not in ('approve','revoke') or nullif(trim(p_actor),'') is null then raise exception 'Valid release decision and actor are required'; end if;
  if p_decision='revoke' and nullif(trim(p_note),'') is null then raise exception 'Revocation requires a note'; end if;
  select * into selected from public.publishing_launch_release_candidates where id=p_release_id for update;
  if not found or selected.status in ('revoked','stale') then raise exception 'Active release candidate is required'; end if;
  select * into handoff from public.publishing_launch_channel_handoffs where id=selected.handoff_id;
  select * into item from public.publishing_launch_calendar_items where id=selected.calendar_item_id;
  select id,status into latest_preflight_id,latest_preflight_status from public.publishing_launch_channel_preflights
    where handoff_id=selected.handoff_id order by run_number desc limit 1;
  if p_decision='approve' then
    if selected.status <> 'pending_approval' or handoff.status <> 'queued' or item.status <> 'approved'
      or item.current_version <> selected.item_version or item.scheduled_for <= now()
      or latest_preflight_id is distinct from selected.preflight_id or latest_preflight_status <> 'ready' then
      raise exception 'Release candidate is no longer approvable';
    end if;
    next_status := 'approved';
    update public.publishing_launch_release_candidates set status=next_status,approved_by=trim(p_actor),approved_at=now(),updated_at=now() where id=selected.id;
  else
    next_status := 'revoked';
    update public.publishing_launch_release_candidates set status=next_status,revoked_by=trim(p_actor),revoked_at=now(),
      revocation_note=trim(p_note),updated_at=now() where id=selected.id;
  end if;
  return jsonb_build_object('release_id',selected.id,'status',next_status,'external_publications_created',false);
end $$;

create or replace function public.publishing_launch_stale_release_on_preflight()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.publishing_launch_release_candidates set status='stale',updated_at=now()
  where handoff_id=new.handoff_id and preflight_id<>new.id and status in ('pending_approval','approved');
  return new;
end $$;
create trigger publishing_launch_stale_release_on_preflight after insert on public.publishing_launch_channel_preflights
for each row execute function public.publishing_launch_stale_release_on_preflight();

create or replace function public.publishing_launch_stale_release_on_handoff_withdrawal()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='withdrawn' and old.status<>new.status then
    update public.publishing_launch_release_candidates set status='stale',updated_at=now()
    where handoff_id=new.id and status in ('pending_approval','approved');
  end if;
  return new;
end $$;
create trigger publishing_launch_stale_release_on_handoff_withdrawal after update on public.publishing_launch_channel_handoffs
for each row execute function public.publishing_launch_stale_release_on_handoff_withdrawal();

revoke all on function public.publishing_prepare_launch_release_candidate(uuid,text) from public,anon,authenticated;
revoke all on function public.publishing_decide_launch_release_candidate(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.publishing_launch_stale_release_on_preflight() from public,anon,authenticated;
revoke all on function public.publishing_launch_stale_release_on_handoff_withdrawal() from public,anon,authenticated;
grant execute on function public.publishing_prepare_launch_release_candidate(uuid,text) to service_role;
grant execute on function public.publishing_decide_launch_release_candidate(uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';
