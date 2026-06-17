-- Lead Intelligence runtime RLS access.
--
-- This migration replaces the temporary BYPASSRLS activation option with a
-- normal dedicated runtime role and explicit role-specific RLS policies. It is
-- additive and does not enable feature flags, create secrets, send email,
-- start property matching, or modify existing Lead Intelligence rows.

do $$
declare
  target_table text;
  marker text := 'Lead Intelligence persistence foundation v1';
  missing_columns text[];
  runtime_oid oid;
  membership_count integer;
  ownership_count integer;
begin
  foreach target_table in array array[
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates'
  ] loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'LEAD_INTELLIGENCE_RUNTIME_SCHEMA_NOT_READY: public.% is missing', target_table;
    end if;

    if coalesce(obj_description(format('public.%I', target_table)::regclass, 'pg_class'), '') <> marker then
      raise exception 'LEAD_INTELLIGENCE_RUNTIME_SCHEMA_INCOMPATIBLE: public.% does not have reviewed foundation marker', target_table;
    end if;
  end loop;

  select array_agg(column_name order by column_name)
  into missing_columns
  from (
    values
      ('lead_intake_messages', 'id'),
      ('lead_intake_messages', 'brand'),
      ('lead_intake_messages', 'source'),
      ('lead_intake_messages', 'status'),
      ('lead_intake_messages', 'created_by'),
      ('lead_intake_messages', 'correlation_id'),
      ('lead_intake_messages', 'idempotency_key'),
      ('lead_analysis_runs', 'id'),
      ('lead_analysis_runs', 'intake_id'),
      ('lead_analysis_runs', 'idempotency_key'),
      ('lead_analysis_runs', 'result_json'),
      ('buyer_profiles', 'id'),
      ('buyer_profiles', 'brand'),
      ('buyer_profiles', 'contact_id'),
      ('buyer_profiles', 'intake_id'),
      ('buyer_profiles', 'version'),
      ('buyer_profiles', 'status'),
      ('buyer_profile_criteria', 'id'),
      ('buyer_profile_criteria', 'buyer_profile_id'),
      ('buyer_profile_criteria', 'criterion_type'),
      ('buyer_profile_criteria', 'key'),
      ('lead_contact_candidates', 'id'),
      ('lead_contact_candidates', 'brand'),
      ('lead_contact_candidates', 'intake_id'),
      ('lead_contact_candidates', 'contact_id'),
      ('lead_contact_candidates', 'match_type'),
      ('lead_contact_candidates', 'match_value_hash'),
      ('lead_contact_candidates', 'score')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_SCHEMA_INCOMPATIBLE: missing required columns %', missing_columns;
  end if;

  if to_regclass('public.contacts') is null then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_SCHEMA_NOT_READY: public.contacts is missing';
  end if;

  select array_agg(column_name order by column_name)
  into missing_columns
  from (
    values
      ('id'),
      ('brand'),
      ('name'),
      ('phone'),
      ('email'),
      ('created_at'),
      ('updated_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'contacts'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_SCHEMA_INCOMPATIBLE: public.contacts missing required columns %', missing_columns;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
    create role realtyflow_lead_intelligence_runtime
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls
      connection limit 5;
  end if;

  select oid
  into runtime_oid
  from pg_roles
  where rolname = 'realtyflow_lead_intelligence_runtime';

  if runtime_oid is null then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_ROLE_MISSING';
  end if;

  if exists (
    select 1
    from pg_roles
    where oid = runtime_oid
      and (
        rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolbypassrls
      )
  ) then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE: runtime role has elevated attributes';
  end if;

  select count(*)::int
  into membership_count
  from pg_auth_members
  where member = runtime_oid
     or roleid = runtime_oid;

  if membership_count <> 0 then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE: runtime role has memberships';
  end if;

  select
    (
      select count(*)::int from pg_class where relowner = runtime_oid
    ) + (
      select count(*)::int from pg_namespace where nspowner = runtime_oid
    ) + (
      select count(*)::int from pg_proc where proowner = runtime_oid
    ) + (
      select count(*)::int from pg_type where typowner = runtime_oid
    )
  into ownership_count;

  if ownership_count <> 0 then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE: runtime role owns database objects';
  end if;

  alter role realtyflow_lead_intelligence_runtime
    login
    nosuperuser
    nocreatedb
    nocreaterole
    noinherit
    nobypassrls
    connection limit 5;

  if exists (
    select 1
    from pg_roles
    where oid = runtime_oid
      and (
        not rolcanlogin
        or rolinherit
        or rolbypassrls
        or rolconnlimit <> 5
      )
  ) then
    raise exception 'LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE: runtime role normalization failed';
  end if;
end $$;

revoke all on schema public from realtyflow_lead_intelligence_runtime;
grant usage on schema public to realtyflow_lead_intelligence_runtime;

revoke all on public.lead_intake_messages from realtyflow_lead_intelligence_runtime;
revoke all on public.lead_analysis_runs from realtyflow_lead_intelligence_runtime;
revoke all on public.buyer_profiles from realtyflow_lead_intelligence_runtime;
revoke all on public.buyer_profile_criteria from realtyflow_lead_intelligence_runtime;
revoke all on public.lead_contact_candidates from realtyflow_lead_intelligence_runtime;
revoke all on public.contacts from realtyflow_lead_intelligence_runtime;
drop policy if exists contacts_lead_intelligence_runtime_select on public.contacts;

drop view if exists public.lead_intelligence_contact_lookup;
create view public.lead_intelligence_contact_lookup
with (security_barrier = true)
as
select
  id,
  brand,
  name,
  phone,
  email,
  created_at,
  updated_at
from public.contacts
where brand = nullif(current_setting('app.lead_intelligence_brand', true), '');

revoke all on public.lead_intelligence_contact_lookup from public;
revoke all on public.lead_intelligence_contact_lookup from anon;
revoke all on public.lead_intelligence_contact_lookup from authenticated;
revoke all on public.lead_intelligence_contact_lookup from realtyflow_lead_intelligence_runtime;

grant select, insert on public.lead_intake_messages to realtyflow_lead_intelligence_runtime;
grant select, insert on public.lead_analysis_runs to realtyflow_lead_intelligence_runtime;
grant select, insert on public.buyer_profiles to realtyflow_lead_intelligence_runtime;
grant select, insert on public.buyer_profile_criteria to realtyflow_lead_intelligence_runtime;
grant select, insert on public.lead_contact_candidates to realtyflow_lead_intelligence_runtime;
grant update (score, reasons, status) on public.lead_contact_candidates to realtyflow_lead_intelligence_runtime;
grant select on public.lead_intelligence_contact_lookup to realtyflow_lead_intelligence_runtime;

revoke all privileges on all sequences in schema public from realtyflow_lead_intelligence_runtime;
revoke all privileges on function public.set_lead_intelligence_updated_at() from realtyflow_lead_intelligence_runtime;
revoke all privileges on function public.set_lead_intelligence_updated_at() from public;
revoke all privileges on function public.set_lead_intelligence_updated_at() from anon;
revoke all privileges on function public.set_lead_intelligence_updated_at() from authenticated;

alter role realtyflow_lead_intelligence_runtime
  set statement_timeout = '30s';
alter role realtyflow_lead_intelligence_runtime
  set lock_timeout = '5s';
alter role realtyflow_lead_intelligence_runtime
  set idle_in_transaction_session_timeout = '30s';

drop policy if exists lead_intake_messages_runtime_select on public.lead_intake_messages;
create policy lead_intake_messages_runtime_select
  on public.lead_intake_messages
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  );

drop policy if exists lead_intake_messages_runtime_insert on public.lead_intake_messages;
create policy lead_intake_messages_runtime_insert
  on public.lead_intake_messages
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  );

drop policy if exists lead_analysis_runs_runtime_select on public.lead_analysis_runs;
create policy lead_analysis_runs_runtime_select
  on public.lead_analysis_runs
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    exists (
      select 1
      from public.lead_intake_messages intake
      where intake.id = lead_analysis_runs.intake_id
        and intake.brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    )
  );

drop policy if exists lead_analysis_runs_runtime_insert on public.lead_analysis_runs;
create policy lead_analysis_runs_runtime_insert
  on public.lead_analysis_runs
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    exists (
      select 1
      from public.lead_intake_messages intake
      where intake.id = lead_analysis_runs.intake_id
        and intake.brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    )
  );

drop policy if exists buyer_profiles_runtime_select on public.buyer_profiles;
create policy buyer_profiles_runtime_select
  on public.buyer_profiles
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  );

drop policy if exists buyer_profiles_runtime_insert on public.buyer_profiles;
create policy buyer_profiles_runtime_insert
  on public.buyer_profiles
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and exists (
      select 1
      from public.lead_intake_messages intake
      where intake.id = buyer_profiles.intake_id
        and intake.brand = buyer_profiles.brand
    )
  );

drop policy if exists buyer_profile_criteria_runtime_select on public.buyer_profile_criteria;
create policy buyer_profile_criteria_runtime_select
  on public.buyer_profile_criteria
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    exists (
      select 1
      from public.buyer_profiles profile
      where profile.id = buyer_profile_criteria.buyer_profile_id
        and profile.brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    )
  );

drop policy if exists buyer_profile_criteria_runtime_insert on public.buyer_profile_criteria;
create policy buyer_profile_criteria_runtime_insert
  on public.buyer_profile_criteria
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    exists (
      select 1
      from public.buyer_profiles profile
      where profile.id = buyer_profile_criteria.buyer_profile_id
        and profile.brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    )
  );

drop policy if exists lead_contact_candidates_runtime_select on public.lead_contact_candidates;
create policy lead_contact_candidates_runtime_select
  on public.lead_contact_candidates
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  );

drop policy if exists lead_contact_candidates_runtime_insert on public.lead_contact_candidates;
create policy lead_contact_candidates_runtime_insert
  on public.lead_contact_candidates
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and exists (
      select 1
      from public.lead_intake_messages intake
      where intake.id = lead_contact_candidates.intake_id
        and intake.brand = lead_contact_candidates.brand
    )
  );

drop policy if exists lead_contact_candidates_runtime_update on public.lead_contact_candidates;
create policy lead_contact_candidates_runtime_update
  on public.lead_contact_candidates
  for update
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  )
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and exists (
      select 1
      from public.lead_intake_messages intake
      where intake.id = lead_contact_candidates.intake_id
        and intake.brand = lead_contact_candidates.brand
    )
  );

comment on role realtyflow_lead_intelligence_runtime is
  'Normal Lead Intelligence runtime role. No BYPASSRLS, no ownership, no DDL. Server must set app.lead_intelligence_brand from validated admin/server context before DB access.';

comment on view public.lead_intelligence_contact_lookup is
  'Restricted contact lookup surface for Lead Intelligence runtime. Exposes only non-token lookup columns and always filters by server-set app.lead_intelligence_brand, even when contacts RLS is disabled.';

comment on policy lead_intake_messages_runtime_select on public.lead_intake_messages is
  'Lead Intelligence runtime can select intakes only for server-validated app.lead_intelligence_brand.';
comment on policy lead_intake_messages_runtime_insert on public.lead_intake_messages is
  'Lead Intelligence runtime can insert intakes only for server-validated app.lead_intelligence_brand.';
comment on policy lead_analysis_runs_runtime_select on public.lead_analysis_runs is
  'Lead Intelligence runtime can select analyses only through brand-matching intakes.';
comment on policy lead_analysis_runs_runtime_insert on public.lead_analysis_runs is
  'Lead Intelligence runtime can insert analyses only through brand-matching intakes.';
comment on policy buyer_profiles_runtime_select on public.buyer_profiles is
  'Lead Intelligence runtime can select buyer profiles only for server-validated app.lead_intelligence_brand.';
comment on policy buyer_profiles_runtime_insert on public.buyer_profiles is
  'Lead Intelligence runtime can insert buyer profiles only for brand-matching intakes.';
comment on policy buyer_profile_criteria_runtime_select on public.buyer_profile_criteria is
  'Lead Intelligence runtime can select criteria only through brand-matching buyer profiles.';
comment on policy buyer_profile_criteria_runtime_insert on public.buyer_profile_criteria is
  'Lead Intelligence runtime can insert criteria only through brand-matching buyer profiles.';
comment on policy lead_contact_candidates_runtime_select on public.lead_contact_candidates is
  'Lead Intelligence runtime can select candidate previews only for server-validated app.lead_intelligence_brand.';
comment on policy lead_contact_candidates_runtime_insert on public.lead_contact_candidates is
  'Lead Intelligence runtime can insert candidate previews only for brand-matching intakes.';
comment on policy lead_contact_candidates_runtime_update on public.lead_contact_candidates is
  'Lead Intelligence runtime can update candidate previews only for brand-matching intakes.';
