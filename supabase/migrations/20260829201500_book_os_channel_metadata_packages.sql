-- Book OS phase 3.5: versioned, channel-specific metadata packages.
-- Approval here never submits or applies metadata to a retailer publication.

create table public.publishing_channel_metadata_packages (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  revision_id uuid not null references public.publishing_catalog_revisions(id) on delete cascade,
  channel text not null check (channel in ('amazon_kdp', 'apple_books', 'google_play_books', 'kobo_writing_life')),
  version integer not null check (version > 0),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'retired')),
  payload jsonb not null,
  source_assignment_ids uuid[] not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  generated_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, revision_id, channel, version),
  check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null))
);

comment on table public.publishing_channel_metadata_packages is
  'Book OS 3.5 proposal/approval packages only; rows do not represent retailer submission or application.';
create index publishing_channel_metadata_packages_lookup
  on public.publishing_channel_metadata_packages (edition_id, revision_id, status, channel, version desc);
alter table public.publishing_channel_metadata_packages enable row level security;
revoke all on table public.publishing_channel_metadata_packages from public, anon, authenticated;
grant select, insert, update, delete on table public.publishing_channel_metadata_packages to service_role;
create policy "publishing_channel_metadata_packages_deny_direct"
  on public.publishing_channel_metadata_packages for all to anon, authenticated using (false) with check (false);

create or replace function public.publishing_stage_channel_metadata_bundle(
  p_edition_id uuid, p_revision_id uuid, p_packages jsonb, p_actor text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; next_version integer; staged_ids uuid[] := array[]::uuid[]; package_id uuid;
begin
  if nullif(trim(p_actor), '') is null or jsonb_typeof(p_packages) <> 'array' or jsonb_array_length(p_packages) <> 4 then
    raise exception 'Actor and exactly four channel packages are required';
  end if;
  if not exists (select 1 from public.publishing_catalog_revisions where id = p_revision_id and edition_id = p_edition_id and is_canonical) then
    raise exception 'Channel packages require the canonical revision';
  end if;
  if (select count(distinct value->>'channel') from jsonb_array_elements(p_packages)) <> 4
    or exists (select 1 from jsonb_array_elements(p_packages) where value->>'channel' not in ('amazon_kdp','apple_books','google_play_books','kobo_writing_life')) then
    raise exception 'One valid package per channel is required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_packages) package,
      unnest(array(select jsonb_array_elements_text(package.value->'source_assignment_ids'))) as source(assignment_id)
    left join public.publishing_edition_taxonomy_assignments assignment on assignment.id = source.assignment_id::uuid
    where assignment.id is null or assignment.edition_id <> p_edition_id or assignment.revision_id is distinct from p_revision_id or assignment.status <> 'approved'
  ) then raise exception 'Every source assignment must be approved for this edition and revision'; end if;

  update public.publishing_channel_metadata_packages set status = 'rejected', updated_at = now()
    where edition_id = p_edition_id and revision_id = p_revision_id and status = 'proposed';
  for item in select value from jsonb_array_elements(p_packages) loop
    if jsonb_typeof(item->'payload') <> 'object' or coalesce((item->'payload'->'delivery'->>'submitted')::boolean, true) then
      raise exception 'Package payload must be explicitly unsent';
    end if;
    select coalesce(max(version), 0) + 1 into next_version from public.publishing_channel_metadata_packages
      where edition_id = p_edition_id and revision_id = p_revision_id and channel = item->>'channel';
    insert into public.publishing_channel_metadata_packages
      (edition_id, revision_id, channel, version, payload, source_assignment_ids, payload_fingerprint, generated_by)
    values (p_edition_id, p_revision_id, item->>'channel', next_version, item->'payload',
      array(select jsonb_array_elements_text(item->'source_assignment_ids'))::uuid[], item->>'payload_fingerprint', trim(p_actor))
    returning id into package_id;
    staged_ids := array_append(staged_ids, package_id);
  end loop;
  return jsonb_build_object('edition_id', p_edition_id, 'revision_id', p_revision_id, 'proposed_ids', staged_ids, 'proposed_count', cardinality(staged_ids));
end $$;

create or replace function public.publishing_decide_channel_metadata_bundle(
  p_package_ids uuid[], p_decision text, p_actor text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_count integer; selected_edition uuid; selected_revision uuid;
begin
  if cardinality(p_package_ids) <> 4 or p_decision not in ('approved','rejected') or nullif(trim(p_actor), '') is null then
    raise exception 'Four packages, a valid decision and actor are required';
  end if;
  perform 1 from public.publishing_channel_metadata_packages where id = any(p_package_ids) order by id for update;
  select count(*) into selected_count from public.publishing_channel_metadata_packages
    where id = any(p_package_ids) and status = 'proposed';
  select edition_id, revision_id into selected_edition, selected_revision
    from public.publishing_channel_metadata_packages where id = any(p_package_ids) and status = 'proposed' limit 1;
  if selected_count <> 4 or (select count(distinct channel) from public.publishing_channel_metadata_packages where id = any(p_package_ids)) <> 4
    or exists (select 1 from public.publishing_channel_metadata_packages where id = any(p_package_ids) and (edition_id <> selected_edition or revision_id <> selected_revision)) then
    raise exception 'Decision requires one proposed package per channel for one revision';
  end if;
  if p_decision = 'approved' then
    update public.publishing_channel_metadata_packages set status = 'retired', updated_at = now()
      where edition_id = selected_edition and status = 'approved' and id <> all(p_package_ids);
    update public.publishing_channel_metadata_packages set status = 'approved', approved_by = trim(p_actor), approved_at = now(), updated_at = now() where id = any(p_package_ids);
  else
    update public.publishing_channel_metadata_packages set status = 'rejected', updated_at = now() where id = any(p_package_ids);
  end if;
  return jsonb_build_object('edition_id', selected_edition, 'revision_id', selected_revision, 'decision', p_decision, 'count', selected_count);
end $$;

revoke all on function public.publishing_stage_channel_metadata_bundle(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.publishing_decide_channel_metadata_bundle(uuid[], text, text) from public, anon, authenticated;
grant execute on function public.publishing_stage_channel_metadata_bundle(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.publishing_decide_channel_metadata_bundle(uuid[], text, text) to service_role;
notify pgrst, 'reload schema';
