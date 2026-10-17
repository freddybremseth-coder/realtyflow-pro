\set ON_ERROR_STOP on
-- Disposable PostgreSQL CI only; prior budget and concurrency fixtures apply.
DO $body$
DECLARE
 t uuid;owner_id uuid:='cccccccc-cccc-cccc-cccc-cccccccccccc';
 reviewer_id uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 mission_id uuid:=gen_random_uuid();
 goal text:='Independent documented analysis proposal test';
 route jsonb;route_digest text; source_digest text:=repeat('c',64);
 permit_id uuid;replay_id uuid;
 denied boolean;review_result text;reserve_row record;
 count_events integer;
BEGIN
 SELECT id INTO t FROM altovena.tenants
 WHERE external_ref='host:realtyflowpro:altovena-internal';
 IF t IS NULL THEN RAISE EXCEPTION 'no CI tenant';END IF;
 IF has_function_privilege('anon',
   'altovena.request_analysis_permit(uuid,uuid,uuid,uuid,text,text,text,integer,integer,bigint,timestamptz)','EXECUTE')
 OR has_function_privilege('authenticated',
   'altovena.review_analysis_permit(uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('service_role',
   'altovena.review_analysis_permit(uuid,uuid,text)','EXECUTE')
 OR has_table_privilege('authenticated',
   'altovena.analysis_evidence_attestations','INSERT')
 THEN RAISE EXCEPTION 'new review boundary granted to API client';END IF;

 route:=jsonb_build_object(
  'schemaVersion',1,'missionId',mission_id::text,
  'mode','ROUTING_PROPOSAL_ONLY',
  'goalDigest',encode(sha256(convert_to(goal,'UTF8')),'hex'),
  'agents',jsonb_build_array(jsonb_build_object(
   'agentId','business','executionStatus','not_started')),
  'controls',jsonb_build_object(
    'approvedForExecution',false,'permittedExternalActions',false,
    'allowedTools',jsonb_build_array())
 );
 route_digest:=encode(sha256(convert_to(route::text,'UTF8')),'hex');
 INSERT INTO altovena.missions(id,tenant_id,product_slug,created_by,goal,state)
 VALUES(mission_id,t,'command',owner_id,goal,'draft');
 INSERT INTO altovena.mission_route_plans(tenant_id,mission_id,proposed_by,plan)
 VALUES(t,mission_id,owner_id,route);
 INSERT INTO altovena.mission_analysis_preparations(
  tenant_id,mission_id,prepared_by,routing_digest,agent_count)
 VALUES(t,mission_id,owner_id,route_digest,1);
 UPDATE altovena.analysis_budget_periods SET limit_cents=60
 WHERE tenant_id=t;

 denied:=false;
 BEGIN
  PERFORM altovena.request_analysis_permit(t,mission_id,
   owner_id,owner_id,'business','gpt-5.6',source_digest,
   900,500,10,clock_timestamp()+interval '8 minutes');
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'self-review request accepted';END IF;

 permit_id:=altovena.request_analysis_permit(t,mission_id,
   owner_id,reviewer_id,'business','gpt-5.6',source_digest,
   900,500,10,clock_timestamp()+interval '8 minutes');

 denied:=false;
 BEGIN
  PERFORM altovena.review_analysis_permit(permit_id,owner_id,'approve');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'self-review allowed';END IF;
 denied:=false;
 BEGIN
  PERFORM altovena.review_analysis_permit(permit_id,reviewer_id,'approve');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'approval without verified source allowed';END IF;

 INSERT INTO altovena.analysis_evidence_attestations(
  tenant_id,mission_id,evidence_digest,verified_by,
  source_count,state,valid_until
 ) VALUES(t,mission_id,source_digest,reviewer_id,
   2,'verified',clock_timestamp()+interval '7 minutes');
 review_result:=altovena.review_analysis_permit(permit_id,reviewer_id,'approve');
 IF review_result<>'approved' THEN RAISE EXCEPTION 'valid review blocked';END IF;
 SELECT count(*) INTO count_events FROM altovena.analysis_permit_review_events
 WHERE permit_id=permit_id;
 -- Use scoped alias to avoid record/output-name ambiguity.
 SELECT count(*) INTO count_events FROM altovena.analysis_permit_review_events e
 WHERE e.permit_id=permit_id;
 IF count_events<>2 THEN RAISE EXCEPTION 'expected request and approval audit';END IF;
 denied:=false;
 BEGIN
  PERFORM altovena.review_analysis_permit(permit_id,reviewer_id,'approve');
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'approved permit reviewed twice';END IF;
 denied:=false;
 BEGIN
  UPDATE altovena.analysis_permit_review_events SET event_type='requested'
  WHERE permit_id=permit_id;
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'review event audit mutable';END IF;

 SELECT * INTO reserve_row FROM altovena.reserve_analysis_budget(
   permit_id,t,owner_id,source_digest,'business','gpt-5.6',
   encode(sha256(convert_to(goal,'UTF8')),'hex'),route_digest,900,500,10);
 IF reserve_row.result_kind<>'reserved' OR reserve_row.result_reservation_id IS NULL
 THEN RAISE EXCEPTION 'reviewed analysis could not reserve once';END IF;
 UPDATE altovena.analysis_evidence_attestations
 SET state='revoked' WHERE tenant_id=t AND mission_id=mission_id;
 denied:=false;
 BEGIN
  -- Direct insertion by a privileged *test* role still must obey source fence.
  INSERT INTO altovena.analysis_reservations(
    tenant_id,permit_id,actor_id,evidence_digest,period_start,committed_cents)
  VALUES(t,permit_id,owner_id,source_digest,
    date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date,10);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'revoked source permitted a new reservation';END IF;
 IF (SELECT count(*) FROM core.nexus_execution_tasks)<>0
 THEN RAISE EXCEPTION 'Nexus unexpectedly launched';END IF;
END;
$body$;
SELECT 'Two-person analysis permit approval and source attestation review passed' AS result;
