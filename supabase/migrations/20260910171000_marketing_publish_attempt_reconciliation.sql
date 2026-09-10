-- Keep marketing_publications aligned with the external publish-attempt ledger.
-- The attempt ledger is written immediately after Meta returns a concrete external
-- post/media id. If the serverless request dies before the orchestrator's second
-- publication-state write, a real post must not remain as `live/draft`.

create or replace function public.reconcile_marketing_publication_from_posted_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, '') <> 'posted'
     or coalesce(new.dry_run, false) = true
     or nullif(coalesce(new.external_media_id, new.external_id, ''), '') is null
     or nullif(coalesce(new.publication_id, ''), '') is null then
    return new;
  end if;

  update public.marketing_publications p
     set state = 'published',
         updated_at = greatest(
           coalesce(p.updated_at, p.created_at, now()),
           coalesce(new.updated_at, now())
         )
   where p.publication_id = new.publication_id
     and p.state <> 'published';

  return new;
end;
$$;

drop trigger if exists trg_reconcile_marketing_publication_from_posted_attempt
  on public.marketing_publish_attempts;

create trigger trg_reconcile_marketing_publication_from_posted_attempt
after insert or update of status, external_id, external_media_id, dry_run
on public.marketing_publish_attempts
for each row
execute function public.reconcile_marketing_publication_from_posted_attempt();

-- One bounded reconciliation for historical rows that already have proof of an
-- external post in the canonical attempt ledger. No row without a real external
-- id is changed.
update public.marketing_publications p
   set state = 'published',
       updated_at = greatest(
         coalesce(p.updated_at, p.created_at, now()),
         coalesce(a.updated_at, now())
       )
  from public.marketing_publish_attempts a
 where p.publication_id = a.publication_id
   and p.state <> 'published'
   and a.status = 'posted'
   and coalesce(a.dry_run, false) = false
   and nullif(coalesce(a.external_media_id, a.external_id, ''), '') is not null;

comment on function public.reconcile_marketing_publication_from_posted_attempt() is
  'Reconciles canonical marketing publication state from proven non-dry-run external posted attempts, preventing stale live/draft rows after serverless interruption.';
