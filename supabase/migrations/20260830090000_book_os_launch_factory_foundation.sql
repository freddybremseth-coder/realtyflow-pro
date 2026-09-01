-- Book OS phase 4.0: one attributable, frequency-capped launch proposal and one approval.
-- Approval does not schedule, publish, or create marketing publications.

create table public.publishing_launch_campaigns (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.publishing_catalog_works(id) on delete cascade,
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  revision_id uuid not null references public.publishing_catalog_revisions(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','retired')),
  source_package_ids uuid[] not null,
  source_asset_ids uuid[] not null,
  plan jsonb not null,
  frequency_policy jsonb not null,
  plan_fingerprint text not null check (plan_fingerprint ~ '^[0-9a-f]{64}$'),
  generated_by text not null,
  model text not null,
  prompt_version text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, revision_id, version),
  check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null))
);
comment on table public.publishing_launch_campaigns is 'Book OS 4.0 launch proposals; approval never means scheduled or published.';
create index publishing_launch_campaigns_lookup on public.publishing_launch_campaigns (edition_id, revision_id, status, version desc);
alter table public.publishing_launch_campaigns enable row level security;
revoke all on table public.publishing_launch_campaigns from public, anon, authenticated;
grant select, insert, update, delete on table public.publishing_launch_campaigns to service_role;
create policy "publishing_launch_campaigns_deny_direct" on public.publishing_launch_campaigns for all to anon, authenticated using (false) with check (false);

create or replace function public.publishing_stage_launch_campaign(
  p_work_id uuid, p_edition_id uuid, p_revision_id uuid, p_source_package_ids uuid[], p_source_asset_ids uuid[],
  p_plan jsonb, p_frequency_policy jsonb, p_plan_fingerprint text, p_actor text, p_model text, p_prompt_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_version integer; campaign_id uuid; item_count integer;
begin
  if nullif(trim(p_actor),'') is null or nullif(trim(p_model),'') is null or nullif(trim(p_prompt_version),'') is null then raise exception 'Generation provenance is required'; end if;
  if not exists (select 1 from public.publishing_catalog_revisions r join public.publishing_catalog_editions e on e.id=r.edition_id where r.id=p_revision_id and r.edition_id=p_edition_id and r.is_canonical and e.work_id=p_work_id) then raise exception 'Launch campaign requires the canonical work, edition and revision'; end if;
  if cardinality(p_source_package_ids) <> 4 or (select count(distinct channel) from public.publishing_channel_metadata_packages where id=any(p_source_package_ids) and edition_id=p_edition_id and revision_id=p_revision_id and status='approved') <> 4 then raise exception 'Four approved channel metadata packages are required'; end if;
  if not exists (select 1 from public.publishing_catalog_assets where id=any(p_source_asset_ids) and edition_id=p_edition_id and revision_id is not distinct from p_revision_id and asset_type='epub' and status='verified' and is_canonical) then raise exception 'Verified canonical EPUB is required'; end if;
  if not exists (select 1 from public.publishing_catalog_assets where id=any(p_source_asset_ids) and edition_id=p_edition_id and asset_type='cover' and status='verified' and is_canonical) then raise exception 'Verified canonical cover is required'; end if;
  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan->'items') <> 'array' then raise exception 'A structured campaign plan is required'; end if;
  item_count := jsonb_array_length(p_plan->'items');
  if item_count not between 10 and 16 then raise exception 'Campaign must contain 10 to 16 items'; end if;
  if coalesce((p_frequency_policy->>'durationDays')::integer,0) <> 30 or coalesce((p_frequency_policy->>'maxTotalPerWeek')::integer,0) > 4 or coalesce((p_frequency_policy->>'maxPerChannelPerWeek')::integer,0) > 2 or coalesce((p_frequency_policy->>'minHoursBetweenSameChannel')::integer,0) < 24 then raise exception 'Frequency policy exceeds Book OS limits'; end if;
  if exists (select 1 from jsonb_array_elements(p_plan->'items') item where coalesce((item->>'offsetDay')::integer,-1) not between 0 and 29 or item->>'channel' not in ('facebook','instagram','email','website')) then raise exception 'Campaign item has invalid day or channel'; end if;
  if exists (select 1 from jsonb_array_elements(p_plan->'items') item group by ((item->>'offsetDay')::integer / 7) having count(*) > 4) then raise exception 'Campaign exceeds weekly total frequency'; end if;
  if exists (select 1 from jsonb_array_elements(p_plan->'items') item group by ((item->>'offsetDay')::integer / 7), item->>'channel' having count(*) > 2) then raise exception 'Campaign exceeds weekly channel frequency'; end if;
  if exists (select 1 from jsonb_array_elements(p_plan->'items') item group by (item->>'offsetDay')::integer, item->>'channel' having count(*) > 1) then raise exception 'Campaign has same-channel collision'; end if;
  update public.publishing_launch_campaigns set status='rejected', updated_at=now() where edition_id=p_edition_id and revision_id=p_revision_id and status='proposed';
  select coalesce(max(version),0)+1 into next_version from public.publishing_launch_campaigns where edition_id=p_edition_id and revision_id=p_revision_id;
  insert into public.publishing_launch_campaigns (work_id,edition_id,revision_id,version,source_package_ids,source_asset_ids,plan,frequency_policy,plan_fingerprint,generated_by,model,prompt_version)
  values (p_work_id,p_edition_id,p_revision_id,next_version,p_source_package_ids,p_source_asset_ids,p_plan,p_frequency_policy,p_plan_fingerprint,trim(p_actor),trim(p_model),trim(p_prompt_version)) returning id into campaign_id;
  return jsonb_build_object('campaign_id',campaign_id,'version',next_version,'status','proposed','item_count',item_count);
end $$;

create or replace function public.publishing_decide_launch_campaign(p_campaign_id uuid, p_decision text, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected public.publishing_launch_campaigns%rowtype;
begin
  if p_decision not in ('approved','rejected') or nullif(trim(p_actor),'') is null then raise exception 'Valid decision and actor are required'; end if;
  select * into selected from public.publishing_launch_campaigns where id=p_campaign_id for update;
  if not found or selected.status <> 'proposed' then raise exception 'Campaign must be proposed'; end if;
  if not exists (select 1 from public.publishing_catalog_revisions where id=selected.revision_id and edition_id=selected.edition_id and is_canonical) then raise exception 'Campaign revision is no longer canonical'; end if;
  if (select count(distinct channel) from public.publishing_channel_metadata_packages where id=any(selected.source_package_ids) and edition_id=selected.edition_id and revision_id=selected.revision_id and status='approved') <> 4 then raise exception 'Source metadata is no longer approved'; end if;
  if not exists (select 1 from public.publishing_catalog_assets where id=any(selected.source_asset_ids) and edition_id=selected.edition_id and asset_type='epub' and status='verified' and is_canonical)
    or not exists (select 1 from public.publishing_catalog_assets where id=any(selected.source_asset_ids) and edition_id=selected.edition_id and asset_type='cover' and status='verified' and is_canonical) then raise exception 'Source assets are no longer canonical'; end if;
  if p_decision='approved' then
    update public.publishing_launch_campaigns set status='retired',updated_at=now() where edition_id=selected.edition_id and status='approved';
    update public.publishing_launch_campaigns set status='approved',approved_by=trim(p_actor),approved_at=now(),updated_at=now() where id=p_campaign_id;
  else
    update public.publishing_launch_campaigns set status='rejected',updated_at=now() where id=p_campaign_id;
  end if;
  return jsonb_build_object('campaign_id',p_campaign_id,'decision',p_decision,'scheduled',false,'published',false);
end $$;

revoke all on function public.publishing_stage_launch_campaign(uuid,uuid,uuid,uuid[],uuid[],jsonb,jsonb,text,text,text,text) from public, anon, authenticated;
revoke all on function public.publishing_decide_launch_campaign(uuid,text,text) from public, anon, authenticated;
grant execute on function public.publishing_stage_launch_campaign(uuid,uuid,uuid,uuid[],uuid[],jsonb,jsonb,text,text,text,text) to service_role;
grant execute on function public.publishing_decide_launch_campaign(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
