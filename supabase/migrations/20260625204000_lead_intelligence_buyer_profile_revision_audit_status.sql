-- Lead Intelligence buyer profile revision audit-status fix
--
-- PR #130 introduced safe buyer profile revisions where an approved profile is
-- marked as superseded after a new version is created. The original approval
-- constraint only allowed approved rows to keep approved_by/approved_at, so
-- approved -> superseded/archived updates failed with SQLSTATE 23514 and were
-- surfaced as REVIEW_CONFLICT.
--
-- This keeps approval audit metadata on historical approved profiles that are
-- later superseded or archived.

begin;

do $$
begin
  if to_regclass('public.buyer_profiles') is null then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_REVISION_AUDIT_SCHEMA_NOT_READY: missing public.buyer_profiles';
  end if;
end $$;

alter table public.buyer_profiles
  drop constraint if exists buyer_profiles_approval_check;

alter table public.buyer_profiles
  add constraint buyer_profiles_approval_check
  check (
    (
      status = 'draft'
      and approved_by is null
      and approved_at is null
    )
    or (
      status in ('approved', 'superseded', 'archived')
      and approved_by is not null
      and approved_at is not null
    )
  );

comment on constraint buyer_profiles_approval_check on public.buyer_profiles is
  'Approved buyer profiles may keep approval audit metadata when later superseded or archived.';

commit;
