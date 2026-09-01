-- Book OS learning-origin production guard
-- Enforces the controlled sequence for projects created from approved learning proposals.
-- Normal Book Engine projects are unaffected.

create or replace function public.publishing_guard_learning_origin_production()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_origin_source text;
  v_start_approved text;
  v_new_state text;
  v_old_state text;
  v_bible_locked boolean;
  v_old_chapter_count integer;
  v_new_chapter_count integer;
begin
  v_origin_source := coalesce(new.metadata_plan #>> '{book_os_origin,source}', '');
  if v_origin_source <> 'approved_learning_proposal' then
    return new;
  end if;

  v_start_approved := nullif(new.metadata_plan #>> '{book_os_origin,production_start_approved_at}', '');
  v_new_state := coalesce(new.metadata_plan ->> 'generation_state', '');
  v_old_state := coalesce(old.metadata_plan ->> 'generation_state', '');
  v_bible_locked := coalesce((new.metadata_plan #>> '{production_bible,locked}')::boolean, false);
  v_old_chapter_count := coalesce(jsonb_array_length(coalesce(old.chapter_drafts, '[]'::jsonb)), 0);
  v_new_chapter_count := coalesce(jsonb_array_length(coalesce(new.chapter_drafts, '[]'::jsonb)), 0);

  -- Creating the draft is allowed, but production states require the separate
  -- explicit start_production approval recorded in book_os_origin.
  if v_new_state in ('bible_generating','bible_ready','author_generating','author_ready','author_partial')
     and v_start_approved is null then
    raise exception using
      errcode = 'P0001',
      message = 'learning_production_start_required',
      detail = 'Learning-origin Book Engine production requires explicit controlled production-start approval.';
  end if;

  -- The author/outline step may not begin before the canonical production bible
  -- has been locked by the SEO/series-bible step.
  if v_new_state = 'author_generating' and not v_bible_locked then
    raise exception using
      errcode = 'P0001',
      message = 'learning_canon_required',
      detail = 'Learning-origin author generation requires a locked production bible/canon first.';
  end if;

  -- New chapter output may only be persisted after the controlled author step
  -- has actually begun. This also blocks retry_generation-style shortcuts that
  -- attempt to jump from a registered/start-approved draft directly to content.
  if v_new_chapter_count > v_old_chapter_count
     and v_old_state not in ('author_generating','author_ready','author_partial') then
    raise exception using
      errcode = 'P0001',
      message = 'learning_author_step_required',
      detail = 'Learning-origin chapter writing requires the controlled outline/first-chapter step first.';
  end if;

  return new;
end;
$$;

drop trigger if exists publishing_guard_learning_origin_production_trg on public.publishing_book_projects;
create trigger publishing_guard_learning_origin_production_trg
before update on public.publishing_book_projects
for each row
execute function public.publishing_guard_learning_origin_production();

comment on function public.publishing_guard_learning_origin_production() is
  'Book OS invariant: approved-learning projects must follow explicit start -> locked canon -> author/outline -> continuation. Other Book Engine projects are unaffected.';
