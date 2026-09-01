-- Book OS: preserve approved-learning provenance when a Book Engine package is ingested.
-- Uses the deterministic Production Handoff work key: book-engine:<project_uuid>.
-- Does not create, approve, launch or publish anything.

create or replace function public.publishing_preserve_book_engine_origin_on_ingest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_key text;
  v_project_id uuid;
  v_project public.publishing_book_projects%rowtype;
  v_origin jsonb;
begin
  v_work_key := nullif(trim(new.manifest->>'workKey'), '');
  if v_work_key is null or v_work_key not like 'book-engine:%' then
    return new;
  end if;

  begin
    v_project_id := substring(v_work_key from length('book-engine:') + 1)::uuid;
  exception when invalid_text_representation then
    raise exception using
      errcode = 'P0001',
      message = 'book_engine_ingest_project_key_invalid',
      detail = 'Book Engine package workKey must contain a valid project UUID.';
  end;

  select * into v_project
  from public.publishing_book_projects
  where id = v_project_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'book_engine_ingest_project_missing',
      detail = 'Book Engine package references a project that does not exist.';
  end if;

  -- Bind the canonical edition back to the exact Book Engine source project.
  update public.publishing_catalog_editions
  set canonical_project_id = v_project_id,
      updated_at = now()
  where id = new.edition_id
    and (canonical_project_id is null or canonical_project_id = v_project_id);

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'book_engine_ingest_project_conflict',
      detail = 'Canonical edition is already bound to a different Book Engine project.';
  end if;

  v_origin := coalesce(v_project.metadata_plan->'book_os_origin', '{}'::jsonb);
  if jsonb_typeof(v_origin) = 'object' and v_origin <> '{}'::jsonb then
    update public.publishing_catalog_revisions
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'book_os_origin', v_origin,
        'source_project_id', v_project_id,
        'provenance_preserved_at', now()
      ),
      updated_at = now()
    where id = new.revision_id;
  end if;

  return new;
end;
$$;

drop trigger if exists publishing_preserve_book_engine_origin_on_ingest_trg
  on public.publishing_package_ingests;
create trigger publishing_preserve_book_engine_origin_on_ingest_trg
after insert on public.publishing_package_ingests
for each row
execute function public.publishing_preserve_book_engine_origin_on_ingest();

comment on function public.publishing_preserve_book_engine_origin_on_ingest() is
  'Book OS provenance invariant: Book Engine package ingest binds the canonical edition to its exact source project and preserves structured book_os_origin on the canonical revision. No approval or publication side effects.';

notify pgrst, 'reload schema';
