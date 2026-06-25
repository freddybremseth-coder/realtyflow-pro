-- Lead Intelligence buyer profile revision gate
-- Allows the runtime role to mark an existing same-brand buyer profile as superseded
-- after a new version has been created in the same transaction.

begin;

do $$
begin
  if to_regclass('public.buyer_profiles') is null then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_REVISION_SCHEMA_NOT_READY: missing public.buyer_profiles';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
    raise exception 'LEAD_INTELLIGENCE_PROFILE_REVISION_SCHEMA_NOT_READY: missing runtime role';
  end if;
end $$;

grant update (status) on public.buyer_profiles to realtyflow_lead_intelligence_runtime;

drop policy if exists buyer_profiles_runtime_supersede on public.buyer_profiles;
create policy buyer_profiles_runtime_supersede
  on public.buyer_profiles
  for update
  to realtyflow_lead_intelligence_runtime
  using (
    brand = current_setting('app.lead_intelligence_brand', true)
    and status in ('draft', 'approved')
  )
  with check (
    brand = current_setting('app.lead_intelligence_brand', true)
    and status = 'superseded'
  );

comment on policy buyer_profiles_runtime_supersede on public.buyer_profiles is
  'Lead Intelligence runtime may only mark same-brand draft/approved buyer profiles as superseded after a new revision has been created.';

commit;
