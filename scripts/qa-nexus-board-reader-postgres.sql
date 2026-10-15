-- Disposable PostgreSQL-only verification of the staged Nexus read role.
-- Execute AFTER the lifecycle fixture; never against live RealtyFlow.
\set ON_ERROR_STOP on

do $reader_grants$
begin
 if not has_table_privilege('nexus_task_board_reader','core.nexus_task_board_entries','select')
    or not has_table_privilege('nexus_task_board_reader','core.nexus_task_board_allowed_readers','select')
 then raise exception 'Restricted task-board views are not readable'; end if;
 if has_table_privilege('nexus_task_board_reader','core.nexus_execution_tasks','select')
    or has_table_privilege('nexus_task_board_reader','core.nexus_execution_approvals','select')
    or has_table_privilege('nexus_task_board_reader','core.nexus_execution_authorizations','select')
    or has_table_privilege('nexus_task_board_reader','core.brand_workspace_memberships','select')
    or has_table_privilege('nexus_task_board_reader','core.nexus_execution_claims','select')
 then raise exception 'Restricted reader can directly inspect private tables'; end if;
 if has_schema_privilege('nexus_task_board_reader','core','create') then
   raise exception 'Restricted reader can create schema objects'; end if;
 if has_function_privilege('nexus_task_board_reader',
       'core.claim_nexus_execution_task(uuid,integer,uuid,uuid,text,text,text)','execute')
    or has_function_privilege('nexus_task_board_reader',
       'core.create_nexus_review_task(uuid,uuid,text,text,text[],text)','execute')
    or has_function_privilege('nexus_task_board_reader',
       'core.decide_nexus_review_task(uuid,uuid,integer,text,text)','execute')
 then raise exception 'Restricted reader can execute Nexus mutations'; end if;
 if exists(select 1 from pg_catalog.pg_roles where rolname='nexus_task_board_reader' and rolcanlogin) then
   raise exception 'Restricted reader role must not permit login'; end if;
end;
$reader_grants$;

-- The fixture revoked the view grant. Verify disabled state under the
-- actual read role, without trusting a forged HTTP staff permission.
set role nexus_task_board_reader;
do $read_disabled$
declare
  v_count integer;
  v_allowed integer;
begin
  select count(*) into v_count from core.nexus_task_board_entries;
  if v_count < 2 then raise exception 'Board projection missing stored tasks'; end if;
  select count(*) into v_allowed from core.nexus_task_board_allowed_readers
    where brand_id='11111111-1111-4111-8111-111111111111'
      and user_id='44444444-4444-4444-8444-444444444444';
  if v_allowed <> 0 then raise exception 'Revoked reader scope still visible'; end if;
end;
$read_disabled$;
reset role;

-- Enable a fixture-only view grant; real service credentials must never
-- write such grants, and this DOES NOT activate production.
update core.nexus_execution_authorizations
set enabled=true
where brand_id='11111111-1111-4111-8111-111111111111'
 and user_id='44444444-4444-4444-8444-444444444444'
 and capability='view';

set role nexus_task_board_reader;
do $read_enabled$
declare
 v_allowed integer;
 v_task_count integer;
 v_json jsonb;
begin
  select count(*) into v_allowed from core.nexus_task_board_allowed_readers
    where brand_id='11111111-1111-4111-8111-111111111111'
      and user_id='44444444-4444-4444-8444-444444444444';
  if v_allowed <> 1 then raise exception 'Valid staff view scope not visible'; end if;
  select count(*) into v_task_count from core.nexus_task_board_entries t
    where t.brand_id='11111111-1111-4111-8111-111111111111'
      and exists (
        select 1 from core.nexus_task_board_allowed_readers r
        where r.brand_id=t.brand_id
          and r.user_id='44444444-4444-4444-8444-444444444444'
      );
  if v_task_count < 2 then raise exception 'Scoped staff cannot see own brand tasks'; end if;
  select to_jsonb(t) into v_json from core.nexus_task_board_entries t
  where t.brand_id='11111111-1111-4111-8111-111111111111'
  order by t.updated_at desc limit 1;
  if v_json ?| array['evidence_refs','proposed_by','reviewed_by','action_digest','claimed_by','contact_email'] then
    raise exception 'Private data was leaked by board projection'; end if;
end;
$read_enabled$;
reset role;

-- Mutation SQL must fail, even if a connection tries to bypass the API.
set role nexus_task_board_reader;
do $read_cannot_mutate$
declare
 denied boolean:=false;
begin
 begin
   update core.nexus_execution_tasks set status='completed'
   where id='66666666-6666-4666-8666-666666666666';
 exception when insufficient_privilege then
   denied:=true;
 end;
 if not denied then raise exception 'Read-only reader mutated task'; end if;
end;
$read_cannot_mutate$;
reset role;

-- Revoke the fixture view permission; the materialized board still contains
-- the tasks but member grants must disappear immediately.
update core.nexus_execution_authorizations set enabled=false
where brand_id='11111111-1111-4111-8111-111111111111'
 and user_id='44444444-4444-4444-8444-444444444444'
 and capability='view';
set role nexus_task_board_reader;
do $read_revoked$
begin
 if exists(select 1 from core.nexus_task_board_allowed_readers
           where user_id='44444444-4444-4444-8444-444444444444') then
   raise exception 'Revoked staff identity remained visible'; end if;
end;
$read_revoked$;
reset role;
