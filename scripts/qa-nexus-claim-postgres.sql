-- Run ONLY against isolated PostgreSQL CI fixture.
\set ON_ERROR_STOP on
insert into auth.users(id) values
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555');
insert into core.brands(id,brand_key) values
 ('11111111-1111-4111-8111-111111111111','altovena');
insert into core.brand_workspace_memberships
 (brand_id,user_id,status,permissions)
values
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','active',array['tasks.joint.write']),
 ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','active',array['tasks.joint.write']),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','active',array['tasks.joint.write']);

insert into core.nexus_execution_authorizations
 (brand_id,user_id,capability,enabled,granted_at,granted_by)
values
 ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','review',true,now(),'22222222-2222-4222-8222-222222222222'),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','execute',false,null,null);
insert into core.nexus_execution_tasks (
 id,brand_id,status,version,action_type,action_digest,proposed_by,
 quality_reviewed,evidence_refs,preflight_passed,preflight_checked_at
) values (
 '66666666-6666-4666-8666-666666666666',
 '11111111-1111-4111-8111-111111111111',
 'approved',3,'shortlist_draft_prepare','sha256:' || repeat('a',64),
 '22222222-2222-4222-8222-222222222222',
 true,array['source-1'],true,clock_timestamp()
);
insert into core.nexus_execution_approvals (
 id,task_id,brand_id,task_version,action_type,action_digest,
 decision,reviewed_by,expires_at
) values (
 '77777777-7777-4777-8777-777777777777',
 '66666666-6666-4666-8666-666666666666',
 '11111111-1111-4111-8111-111111111111',
 3,'shortlist_draft_prepare','sha256:' || repeat('a',64),
 'approved','33333333-3333-4333-8333-333333333333',
 clock_timestamp() + interval '10 minutes'
);
do $safety$
begin
 if has_function_privilege('anon','core.claim_nexus_execution_task(uuid,integer,uuid,uuid,text,text,text)','execute')
    or has_function_privilege('authenticated','core.claim_nexus_execution_task(uuid,integer,uuid,uuid,text,text,text)','execute') then
    raise exception 'Claim function unexpectedly exposed to public roles';
 end if;
 if exists (select 1 from core.nexus_execution_claims)
    or exists (select 1 from core.nexus_execution_claim_events) then
    raise exception 'Migration unexpectedly created execution claims';
 end if;
end;
$safety$;

-- An ordinary member does not inherit execution merely from workspace access.
set role service_role;
do $no_implicit_grant$
declare
 denied boolean := false;
begin
 begin
   perform * from core.claim_nexus_execution_task(
      '66666666-6666-4666-8666-666666666666',3,
      '44444444-4444-4444-8444-444444444444',
      '77777777-7777-4777-8777-777777777777',
      'shortlist_draft_prepare','sha256:' || repeat('a',64),
      'op_' || repeat('b',40)
   );
 exception when insufficient_privilege then
   denied := true;
 end;
 if not denied then raise exception 'Unenabled execution was allowed'; end if;
end;
$no_implicit_grant$;
reset role;

update core.nexus_execution_authorizations
set enabled=true,granted_at=now(),granted_by='22222222-2222-4222-8222-222222222222'
where user_id='44444444-4444-4444-8444-444444444444' and capability='execute';

set role service_role;
do $single_claim$
declare
 v_outcome text;
 v_id uuid;
 v_duplicate_id uuid;
 denied boolean := false;
begin
 select outcome,claim_id into v_outcome,v_id
 from core.claim_nexus_execution_task(
  '66666666-6666-4666-8666-666666666666',3,
  '44444444-4444-4444-8444-444444444444',
  '77777777-7777-4777-8777-777777777777',
  'shortlist_draft_prepare','sha256:' || repeat('a',64),
  'op_' || repeat('b',40)
 );
 if v_outcome <> 'claimed' or v_id is null then
   raise exception 'Expected committed claim receipt';
 end if;
 select outcome,claim_id into v_outcome,v_duplicate_id
 from core.claim_nexus_execution_task(
  '66666666-6666-4666-8666-666666666666',3,
  '44444444-4444-4444-8444-444444444444',
  '77777777-7777-4777-8777-777777777777',
  'shortlist_draft_prepare','sha256:' || repeat('a',64),
  'op_' || repeat('b',40)
 );
 if v_outcome <> 'duplicate' or v_id <> v_duplicate_id then
   raise exception 'Replay did not return the original claim';
 end if;

 begin
   perform * from core.claim_nexus_execution_task(
    '66666666-6666-4666-8666-666666666666',3,
    '44444444-4444-4444-8444-444444444444',
    '77777777-7777-4777-8777-777777777777',
    'shortlist_draft_prepare','sha256:' || repeat('a',64),
    'op_' || repeat('c',40)
   );
 exception when unique_violation then denied:=true;
 end;
 if not denied then raise exception 'Changed key allowed a second claim'; end if;
 if (select count(*) from core.nexus_execution_claims) <> 1
    or (select count(*) from core.nexus_execution_claim_events) <> 1
    or (select status from core.nexus_execution_tasks
         where id='66666666-6666-4666-8666-666666666666') <> 'executing'
    or (select version from core.nexus_execution_tasks
         where id='66666666-6666-4666-8666-666666666666') <> 4
 then
   raise exception 'Claim, audit and task status did not commit exactly once';
 end if;
end;
$single_claim$;
reset role;
