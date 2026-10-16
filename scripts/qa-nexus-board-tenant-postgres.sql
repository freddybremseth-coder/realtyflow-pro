-- Disposable PostgreSQL test: two brands, two verified identities, no external calls.
-- Run only after qa-nexus-board-reader-postgres.sql in the isolated CI database.
\set ON_ERROR_STOP on
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into core.brands(id,brand_key) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','pinosoecolife');
insert into core.brand_workspace_memberships(brand_id,user_id,status,permissions) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'active',array['nexus.read','tasks.joint.write']);
insert into core.nexus_execution_authorizations
 (brand_id,user_id,capability,enabled,granted_at,granted_by) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'view',true,now(),'22222222-2222-4222-8222-222222222222');

-- Existing fixture member 444... has nexus.read but view was revoked.
-- Re-enable view ONLY inside disposable CI to exercise the two-brand case.
update core.nexus_execution_authorizations
set enabled=true
where brand_id='11111111-1111-4111-8111-111111111111'
  and user_id='44444444-4444-4444-8444-444444444444'
  and capability='view';

insert into core.nexus_execution_tasks(
 id,brand_id,status,version,action_type,action_digest,
 proposed_by,quality_reviewed,evidence_refs,preflight_passed
) values (
 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'review_required',1,'shortlist_draft_prepare',
 'sha256:'||repeat('c',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 false,array['test:source:b'],false
);

-- Imitate the exact parameterized row predicate of the server board, under
-- its limited DB role. Each user must only match tasks in their OWN brand.
set role nexus_task_board_reader;
do $two_brand_read$
declare
  v_a_own int;
  v_a_other int;
  v_b_own int;
  v_b_other int;
begin
  select count(*) into v_a_own
   from core.nexus_task_board_entries t
   where t.brand_id='11111111-1111-4111-8111-111111111111'
    and exists(select 1 from core.nexus_task_board_allowed_readers r
               where r.brand_id=t.brand_id
                 and r.user_id='44444444-4444-4444-8444-444444444444');
  select count(*) into v_a_other
   from core.nexus_task_board_entries t
   where t.brand_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    and exists(select 1 from core.nexus_task_board_allowed_readers r
               where r.brand_id=t.brand_id
                 and r.user_id='44444444-4444-4444-8444-444444444444');
  select count(*) into v_b_own
   from core.nexus_task_board_entries t
   where t.brand_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    and exists(select 1 from core.nexus_task_board_allowed_readers r
               where r.brand_id=t.brand_id
                 and r.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  select count(*) into v_b_other
   from core.nexus_task_board_entries t
   where t.brand_id='11111111-1111-4111-8111-111111111111'
    and exists(select 1 from core.nexus_task_board_allowed_readers r
               where r.brand_id=t.brand_id
                 and r.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if v_a_own < 1 or v_b_own <> 1 or v_a_other <> 0 or v_b_other <> 0 then
    raise exception 'Cross-brand board isolation failed: a_own=%,a_other=%,b_own=%,b_other=%',
      v_a_own,v_a_other,v_b_own,v_b_other;
  end if;
end;
$two_brand_read$;
reset role;

-- Immediate membership suspension MUST suppress the view grant even though
-- the dedicated capability record is still enabled.
update core.brand_workspace_memberships set status='revoked'
 where brand_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   and user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role nexus_task_board_reader;
do $suspended$
begin
 if exists(select 1 from core.nexus_task_board_allowed_readers r
          where r.brand_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            and r.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
   raise exception 'Revoked membership still has view access';
 end if;
end;
$suspended$;
reset role;

-- Switch membership back to active but remove nexus.read. That must
-- be independently sufficient to revoke access, even with view enabled.
update core.brand_workspace_memberships
 set status='active', permissions=array['tasks.joint.write']
 where brand_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   and user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role nexus_task_board_reader;
do $no_nexus_permission$
begin
 if exists(select 1 from core.nexus_task_board_allowed_readers
   where brand_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     and user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
   raise exception 'Ordinary task write inherited Nexus read access';
 end if;
end;
$no_nexus_permission$;
reset role;
