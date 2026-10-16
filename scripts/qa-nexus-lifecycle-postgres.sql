-- Dedicated disposable CI fixture: run after claim migration and claim tests.
\set ON_ERROR_STOP on
do $privileges$
begin
 if has_function_privilege('anon',
      'core.create_nexus_review_task(uuid,uuid,text,text,text[],text)','execute')
   or has_function_privilege('authenticated',
      'core.decide_nexus_review_task(uuid,uuid,integer,text,text)','execute')
 then
   raise exception 'Nexus proposal/review functions are publicly executable';
 end if;
 if exists (select 1 from core.nexus_execution_authorizations where capability='propose') then
   raise exception 'Migration unexpectedly granted proposal capability';
 end if;
end;
$privileges$;

set role service_role;
do $no_default_access$
declare
 denied boolean := false;
begin
 begin
   perform core.create_nexus_review_task(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'shortlist_draft_prepare','sha256:' || repeat('a',64),
      array['source:test'],'op_' || repeat('d',40)
   );
 exception when insufficient_privilege then
   denied := true;
 end;
 if not denied then raise exception 'Unapproved proposer had implicit access'; end if;
end;
$no_default_access$;
reset role;

-- Test-only grant: a real workflow will need a separate owner-controlled and
-- audited grant management implementation.
insert into core.nexus_execution_authorizations (
 brand_id,user_id,capability,enabled,granted_at,granted_by
) values (
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'propose',true,now(),'33333333-3333-4333-8333-333333333333'
);

set role service_role;
do $proposal_and_review$
declare
 v_task_id uuid;
 v_duplicate uuid;
 v_approved text;
 v_approval uuid;
 v_version integer;
 denied boolean := false;
begin
 select core.create_nexus_review_task(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'shortlist_draft_prepare','sha256:' || repeat('a',64),
    array['source:test'],'op_' || repeat('d',40)
 ) into v_task_id;
 if v_task_id is null then raise exception 'Task not created'; end if;
 select core.create_nexus_review_task(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'shortlist_draft_prepare','sha256:' || repeat('a',64),
    array['source:test'],'op_' || repeat('d',40)
 ) into v_duplicate;
 if v_duplicate<>v_task_id then raise exception 'Proposal dedupe failed'; end if;
 if (select count(*) from core.nexus_execution_task_events
      where task_id=v_task_id and event_type='proposal_created')<>1
 then raise exception 'Duplicate proposal wrote extra event'; end if;

 -- Same proposal key with changed action content must not silently alias.
 denied:=false;
 begin
   perform core.create_nexus_review_task(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'shortlist_draft_prepare','sha256:' || repeat('b',64),
      array['source:test'],'op_' || repeat('d',40)
   );
 exception when unique_violation then denied:=true;
 end;
 if not denied then raise exception 'Tampered proposal aliased prior key'; end if;

 -- The proposer cannot approve their own work even when a review
 -- capability is accidentally granted later.
 denied:=false;
 begin
   perform * from core.decide_nexus_review_task(
      v_task_id,'22222222-2222-4222-8222-222222222222',1,
      'approved','sha256:' || repeat('a',64)
   );
 exception when serialization_failure then denied:=true;
 end;
 if not denied then raise exception 'Self review was allowed'; end if;

 select outcome,task_version,approval_id
   into v_approved,v_version,v_approval
 from core.decide_nexus_review_task(
    v_task_id,'33333333-3333-4333-8333-333333333333',1,
    'approved','sha256:' || repeat('a',64)
 );
 if v_approved<>'approved' or v_version<>2 or v_approval is null
    or (select status from core.nexus_execution_tasks where id=v_task_id)<>'approved'
 then raise exception 'Review did not commit approval and task version'; end if;
 if (select count(*) from core.nexus_execution_task_events where task_id=v_task_id)<>2
 then raise exception 'Expected proposal + approval audit'; end if;

 -- Duplicate review must not create another decision or approval.
 denied:=false;
 begin
   perform * from core.decide_nexus_review_task(
      v_task_id,'33333333-3333-4333-8333-333333333333',1,
      'approved','sha256:' || repeat('a',64)
   );
 exception when serialization_failure then denied:=true;
 end;
 if not denied then raise exception 'Second approval was allowed'; end if;

 -- Even after approval, no claim is possible until a trusted preflight
 -- writer certifies the exact action. No such writer is enabled here.
 denied:=false;
 begin
   perform * from core.claim_nexus_execution_task(
     v_task_id,2,'44444444-4444-4444-8444-444444444444',
     v_approval,'shortlist_draft_prepare',
     'sha256:' || repeat('a',64),'op_' || repeat('f',40)
   );
 exception when invalid_parameter_value then denied:=true;
 end;
 if not denied then raise exception 'Task executed claim before preflight'; end if;
 if exists (select 1 from core.nexus_execution_claims where task_id=v_task_id)
 then raise exception 'Blocked preflight still committed claim'; end if;
end;
$proposal_and_review$;
reset role;

-- Simulation only: a privileged fixture marks the preflight passed to
-- test the claim chain. THIS IS NOT A LIVE API OR USER ACTION.
update core.nexus_execution_tasks
set preflight_passed=true,preflight_checked_at=clock_timestamp()
where proposal_key='op_' || repeat('d',40);

set role service_role;
do $propose_review_claim$
declare
 v_task_id uuid;
 v_approval_id uuid;
 v_claim uuid;
 v_status text;
begin
 select id into v_task_id from core.nexus_execution_tasks
 where proposal_key='op_' || repeat('d',40);
 select id into v_approval_id from core.nexus_execution_approvals
 where task_id=v_task_id;
 select outcome,claim_id into v_status,v_claim
 from core.claim_nexus_execution_task(
    v_task_id,2,'44444444-4444-4444-8444-444444444444',
    v_approval_id,'shortlist_draft_prepare',
    'sha256:' || repeat('a',64),'op_' || repeat('f',40)
 );
 if v_status<>'claimed' or v_claim is null then
   raise exception 'Reviewed preflight task not claimed'; end if;
 if (select count(*) from core.nexus_execution_claim_events where task_id=v_task_id)<>1
    or (select count(*) from core.nexus_execution_task_events where task_id=v_task_id)<>2
    or (select version from core.nexus_execution_tasks where id=v_task_id)<>3
 then raise exception 'Full lifecycle audit/version mismatch'; end if;
end;
$propose_review_claim$;
reset role;

-- Rejection is terminal; the audit must be durable and cannot authorize claim.
set role service_role;
do $reject$
declare
 v_task_id uuid;
 v_state text;
 v_version integer;
 v_approval_id uuid;
begin
 select core.create_nexus_review_task(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'presentation_draft_prepare','sha256:' || repeat('c',64),
    array['source:rejection'],'op_' || repeat('e',40)
 ) into v_task_id;
 select outcome,task_version,approval_id
 into v_state,v_version,v_approval_id
 from core.decide_nexus_review_task(
    v_task_id,'33333333-3333-4333-8333-333333333333',
    1,'rejected','sha256:' || repeat('c',64)
 );
 if v_state<>'rejected' or v_version<>2 or v_approval_id is null
    or (select status from core.nexus_execution_tasks where id=v_task_id)<>'rejected'
    or (select count(*) from core.nexus_execution_task_events where task_id=v_task_id)<>2
 then raise exception 'Rejected task lifecycle not durable'; end if;
end;
$reject$;
reset role;

-- Staff read permission is separate from ordinary Nexus workspace access.
do $view_default$
begin
 if exists(select 1 from core.nexus_execution_authorizations where capability='view') then
   raise exception 'Migration incorrectly activated staff view capabilities';
 end if;
end;
$view_default$;

insert into core.nexus_execution_authorizations
 (brand_id,user_id,capability,enabled,granted_at,granted_by)
values
 ('11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  'view',true,now(),'22222222-2222-4222-8222-222222222222');

-- A view capability must also require an active current membership with
-- independent nexus.read permission. Existing tasks.joint.write is insufficient.
do $view_scoped$
declare
 allowed boolean;
begin
 select exists(
    select 1 from core.nexus_execution_authorizations a
    join core.brand_workspace_memberships m
      on m.brand_id=a.brand_id and m.user_id=a.user_id
    where a.brand_id='11111111-1111-4111-8111-111111111111'
      and a.user_id='44444444-4444-4444-8444-444444444444'
      and a.capability='view' and a.enabled=true
      and m.status='active' and 'nexus.read'=any(m.permissions)
 ) into allowed;
 if allowed then raise exception 'Existing task write grant improperly enabled Nexus read'; end if;
end;
$view_scoped$;
update core.brand_workspace_memberships
set permissions=array_append(permissions,'nexus.read')
where brand_id='11111111-1111-4111-8111-111111111111'
 and user_id='44444444-4444-4444-8444-444444444444';
do $view_active$
begin
 if not exists(
    select 1 from core.nexus_execution_authorizations a
    join core.brand_workspace_memberships m
      on m.brand_id=a.brand_id and m.user_id=a.user_id
    where a.brand_id='11111111-1111-4111-8111-111111111111'
      and a.user_id='44444444-4444-4444-8444-444444444444'
      and a.capability='view' and a.enabled=true
      and m.status='active' and 'nexus.read'=any(m.permissions)
 ) then raise exception 'Scoped view capability not recognized'; end if;
end;
$view_active$;
update core.nexus_execution_authorizations
set enabled=false
where user_id='44444444-4444-4444-8444-444444444444' and capability='view';
do $view_revoked$
begin
 if exists(
    select 1 from core.nexus_execution_authorizations a
    where a.user_id='44444444-4444-4444-8444-444444444444'
      and a.capability='view' and a.enabled=true
 ) then raise exception 'Disabled view capability was still authorized'; end if;
end;
$view_revoked$;
