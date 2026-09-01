-- Book OS phase 3.1: approve one reviewed bible/canon bundle atomically.
-- The function is service-only; UI/API authentication remains in the app.

create or replace function public.publishing_approve_work_bible_bundle(bible_ids uuid[], actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
  selected_types integer;
  selected_work uuid;
  row_item record;
begin
  if coalesce(array_length(bible_ids, 1), 0) = 0 then
    raise exception 'At least one bible id is required';
  end if;
  if nullif(trim(actor), '') is null then
    raise exception 'Actor is required';
  end if;

  perform 1
  from public.publishing_work_bibles
  where id = any(bible_ids)
  order by id
  for update;

  select count(*), count(distinct bible_type), min(work_id)
  into selected_count, selected_types, selected_work
  from public.publishing_work_bibles
  where id = any(bible_ids);

  if selected_count <> cardinality(bible_ids) then
    raise exception 'One or more bible records were not found';
  end if;
  if selected_types <> selected_count then
    raise exception 'Only one version of each bible type can be approved in one bundle';
  end if;
  if exists (select 1 from public.publishing_work_bibles where id = any(bible_ids) and work_id <> selected_work) then
    raise exception 'All bible records must belong to the same work';
  end if;
  if exists (
    select 1 from public.publishing_work_bibles
    where id = any(bible_ids)
      and (status not in ('draft', 'review') or content = '{}'::jsonb)
  ) then
    raise exception 'Only non-empty draft or review records can be approved';
  end if;

  for row_item in
    select id, work_id, bible_type from public.publishing_work_bibles where id = any(bible_ids)
  loop
    update public.publishing_work_bibles
    set status = 'superseded', updated_at = now()
    where work_id = row_item.work_id
      and bible_type = row_item.bible_type
      and status = 'approved'
      and id <> row_item.id;
  end loop;

  update public.publishing_work_bibles
  set status = 'approved', approved_by = trim(actor), approved_at = now(), updated_at = now()
  where id = any(bible_ids);

  return jsonb_build_object(
    'work_id', selected_work,
    'approved_ids', to_jsonb(bible_ids),
    'approved_count', selected_count,
    'approved_by', trim(actor)
  );
end;
$$;

revoke all on function public.publishing_approve_work_bible_bundle(uuid[], text) from public, anon, authenticated;
grant execute on function public.publishing_approve_work_bible_bundle(uuid[], text) to service_role;

notify pgrst, 'reload schema';
