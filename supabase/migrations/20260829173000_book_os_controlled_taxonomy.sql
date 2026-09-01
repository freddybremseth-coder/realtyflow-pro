-- Book OS phase 3.4: controlled taxonomy proposals and atomic bundle approval.

alter table public.publishing_taxonomy_terms
  drop constraint if exists publishing_taxonomy_terms_scheme_check;
alter table public.publishing_taxonomy_terms
  add constraint publishing_taxonomy_terms_scheme_check check (scheme in (
    'bisac', 'amazon_category', 'apple_category', 'google_category', 'kobo_category',
    'internal_theme', 'internal_keyword', 'internal_audience'
  ));

create or replace function public.publishing_stage_taxonomy_bundle(
  p_edition_id uuid,
  p_revision_id uuid,
  p_language text,
  p_proposals jsonb,
  p_evidence jsonb,
  p_actor text,
  p_source_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  term_id uuid;
  assignment_id uuid;
  staged_ids uuid[] := array[]::uuid[];
  proposal_count integer;
begin
  if nullif(trim(p_actor), '') is null or nullif(trim(p_language), '') is null then
    raise exception 'Actor and language are required';
  end if;
  if jsonb_typeof(p_proposals) <> 'array' then raise exception 'Proposals must be an array'; end if;
  proposal_count := jsonb_array_length(p_proposals);
  if proposal_count < 8 or proposal_count > 18 then raise exception 'Taxonomy bundle must contain 8 to 18 proposals'; end if;
  if not exists (
    select 1 from public.publishing_catalog_revisions
    where id = p_revision_id and edition_id = p_edition_id and is_canonical
  ) then raise exception 'Taxonomy bundle requires the canonical revision'; end if;
  if (select count(*) from jsonb_array_elements(p_proposals) x where x->>'assignment_type' = 'category') < 1 then raise exception 'At least one category is required'; end if;
  if (select count(*) from jsonb_array_elements(p_proposals) x where x->>'assignment_type' = 'keyword') not between 5 and 7 then raise exception 'Five to seven keywords are required'; end if;

  update public.publishing_edition_taxonomy_assignments
  set status = 'rejected', updated_at = now()
  where edition_id = p_edition_id and revision_id is not distinct from p_revision_id and status = 'proposed';

  for item in select value from jsonb_array_elements(p_proposals)
  loop
    if (item->>'assignment_type') not in ('category', 'keyword', 'audience', 'theme')
      or nullif(trim(item->>'scheme'), '') is null or nullif(trim(item->>'code'), '') is null
      or nullif(trim(item->>'label'), '') is null then
      raise exception 'Every taxonomy proposal needs a valid type, scheme, code and label';
    end if;

    insert into public.publishing_taxonomy_terms
      (scheme, channel, code, label, language, source, source_version, metadata)
    values
      (item->>'scheme', coalesce(item->>'channel', ''), item->>'code', item->>'label', lower(trim(p_language)),
       'openai_research', p_source_version, jsonb_build_object('evidence', coalesce(p_evidence, '{}'::jsonb)))
    on conflict (scheme, channel, code, language) do update
      set label = excluded.label, source = excluded.source, source_version = excluded.source_version,
          metadata = excluded.metadata, active = true, updated_at = now()
    returning id into term_id;

    select id into assignment_id
    from public.publishing_edition_taxonomy_assignments
    where edition_id = p_edition_id and revision_id is not distinct from p_revision_id
      and scheme = item->>'scheme' and channel = coalesce(item->>'channel', '')
      and assignment_type = item->>'assignment_type' and code = item->>'code'
    for update;

    if assignment_id is null then
      insert into public.publishing_edition_taxonomy_assignments
        (edition_id, revision_id, taxonomy_term_id, scheme, channel, code, label, assignment_type,
         rank, status, confidence, evidence, proposed_by)
      values
        (p_edition_id, p_revision_id, term_id, item->>'scheme', coalesce(item->>'channel', ''), item->>'code', item->>'label',
         item->>'assignment_type', greatest(1, coalesce((item->>'rank')::integer, 1)), 'proposed',
         least(1, greatest(0, coalesce((item->>'confidence')::numeric, 0))),
         coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('rationale', coalesce(item->>'rationale', '')), trim(p_actor))
      returning id into assignment_id;
      staged_ids := array_append(staged_ids, assignment_id);
    elsif exists (select 1 from public.publishing_edition_taxonomy_assignments where id = assignment_id and status not in ('approved', 'applied')) then
      update public.publishing_edition_taxonomy_assignments
      set taxonomy_term_id = term_id, label = item->>'label', rank = greatest(1, coalesce((item->>'rank')::integer, 1)),
          status = 'proposed', confidence = least(1, greatest(0, coalesce((item->>'confidence')::numeric, 0))),
          evidence = coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('rationale', coalesce(item->>'rationale', '')),
          proposed_by = trim(p_actor), approved_by = null, approved_at = null, applied_at = null, updated_at = now()
      where id = assignment_id;
      staged_ids := array_append(staged_ids, assignment_id);
    end if;
    assignment_id := null;
  end loop;

  return jsonb_build_object('edition_id', p_edition_id, 'revision_id', p_revision_id, 'proposed_ids', to_jsonb(staged_ids), 'proposed_count', cardinality(staged_ids));
end;
$$;

create or replace function public.publishing_decide_taxonomy_bundle(
  p_assignment_ids uuid[],
  p_decision text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
  selected_edition uuid;
  selected_revision uuid;
  keyword_count integer;
  category_count integer;
begin
  if coalesce(array_length(p_assignment_ids, 1), 0) = 0 then raise exception 'Assignment ids are required'; end if;
  if p_decision not in ('approved', 'rejected') or nullif(trim(p_actor), '') is null then raise exception 'Valid decision and actor are required'; end if;
  perform 1 from public.publishing_edition_taxonomy_assignments where id = any(p_assignment_ids) order by id for update;
  select count(*), min(edition_id), min(revision_id) into selected_count, selected_edition, selected_revision
  from public.publishing_edition_taxonomy_assignments where id = any(p_assignment_ids) and status = 'proposed';
  if selected_count <> cardinality(p_assignment_ids) then raise exception 'Every selected assignment must be proposed'; end if;
  if exists (select 1 from public.publishing_edition_taxonomy_assignments where id = any(p_assignment_ids) and (edition_id <> selected_edition or revision_id is distinct from selected_revision)) then
    raise exception 'One bundle cannot mix editions or revisions';
  end if;

  if p_decision = 'approved' then
    select count(*) into keyword_count from public.publishing_edition_taxonomy_assignments where id = any(p_assignment_ids) and assignment_type = 'keyword';
    select count(*) into category_count from public.publishing_edition_taxonomy_assignments where id = any(p_assignment_ids) and assignment_type = 'category';
    if keyword_count not between 5 and 7 or category_count < 1 then raise exception 'Approval requires one category and five to seven keywords'; end if;
    update public.publishing_edition_taxonomy_assignments old
    set status = 'retired', updated_at = now()
    where old.edition_id = selected_edition and old.revision_id is not distinct from selected_revision
      and old.status = 'approved' and old.id <> all(p_assignment_ids)
      and old.assignment_type in (select assignment_type from public.publishing_edition_taxonomy_assignments where id = any(p_assignment_ids));
    update public.publishing_edition_taxonomy_assignments set status = 'approved', approved_by = trim(p_actor), approved_at = now(), updated_at = now()
    where id = any(p_assignment_ids);
  else
    update public.publishing_edition_taxonomy_assignments set status = 'rejected', approved_by = null, approved_at = null, updated_at = now()
    where id = any(p_assignment_ids);
  end if;

  return jsonb_build_object('edition_id', selected_edition, 'revision_id', selected_revision, 'decision', p_decision, 'count', selected_count);
end;
$$;

revoke all on function public.publishing_stage_taxonomy_bundle(uuid, uuid, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.publishing_decide_taxonomy_bundle(uuid[], text, text) from public, anon, authenticated;
grant execute on function public.publishing_stage_taxonomy_bundle(uuid, uuid, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.publishing_decide_taxonomy_bundle(uuid[], text, text) to service_role;

notify pgrst, 'reload schema';
