\set ON_ERROR_STOP on
-- Disposable PostgreSQL only; synthesize preauthorized source snapshots.
DO $test$
DECLARE
 v_tenant uuid; v_mission uuid:=gen_random_uuid();
 v_actor uuid:='cccccccc-cccc-cccc-cccc-cccccccccccc';
 v_reviewer uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 v_goal text:='Analyze synthetic previously authorized source snapshots';
 v_route jsonb;v_route_digest text;
 v_excerpt_a text:='Synthetic internal site inspection says equipment is operational and water flow is 8.5 cubic meters.';
 v_excerpt_b text:='Synthetic internal field log records an irrigation inspection dated today and requires human review.';
 v_hash_a text;v_hash_b text;v_bundle_digest text;
 v_time text;v_sources jsonb;v_permit uuid;v_result text;
 v_blocked boolean;v_count integer;
BEGIN
 SELECT id INTO v_tenant FROM altovena.tenants
 WHERE external_ref='host:realtyflowpro:altovena-internal';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'missing_test_tenant';END IF;
 IF has_function_privilege('anon',
    'altovena.save_analysis_source_bundle(uuid,uuid,uuid,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
    'altovena.attest_saved_analysis_sources(uuid,uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('service_role',
    'altovena.save_analysis_source_bundle(uuid,uuid,uuid,text,jsonb)','EXECUTE')
  OR has_table_privilege('service_role',
    'altovena.analysis_source_snapshots','SELECT')
 THEN RAISE EXCEPTION 'source_bundle_privilege_leak';END IF;
 v_route:=jsonb_build_object(
  'schemaVersion',1,'missionId',v_mission::text,
  'mode','ROUTING_PROPOSAL_ONLY',
  'goalDigest',encode(sha256(convert_to(v_goal,'UTF8')),'hex'),
  'agents',jsonb_build_array(jsonb_build_object(
   'agentId','business','executionStatus','not_started')),
  'controls',jsonb_build_object('approvedForExecution',false,
   'permittedExternalActions',false,'allowedTools',jsonb_build_array())
 );
 v_route_digest:=encode(sha256(convert_to(v_route::text,'UTF8')),'hex');
 INSERT INTO altovena.missions(id,tenant_id,product_slug,created_by,goal,state)
 VALUES(v_mission,v_tenant,'command',v_actor,v_goal,'draft');
 INSERT INTO altovena.mission_route_plans(
 tenant_id,mission_id,proposed_by,plan)
 VALUES(v_tenant,v_mission,v_actor,v_route);
 INSERT INTO altovena.mission_analysis_preparations(
 tenant_id,mission_id,prepared_by,routing_digest,agent_count)
 VALUES(v_tenant,v_mission,v_actor,v_route_digest,1);

 v_hash_a:=encode(sha256(convert_to(v_excerpt_a,'UTF8')),'hex');
 v_hash_b:=encode(sha256(convert_to(v_excerpt_b,'UTF8')),'hex');
 v_bundle_digest:=encode(sha256(convert_to(
  'altovena-source-bundle-v1'||chr(10)||v_tenant::text||chr(10)
    ||v_mission::text||chr(10)||'inspection_01:'||v_hash_a||chr(10)
    ||'inspection_02:'||v_hash_b,'UTF8')),'hex');
 v_time:=to_char(clock_timestamp() AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 v_sources:=jsonb_build_array(
  jsonb_build_object('sourceId','inspection_01',
   'sourceRef','internal:approved/site/inspection',
   'excerpt',v_excerpt_a,'excerptDigest',v_hash_a,'capturedAt',v_time),
  jsonb_build_object('sourceId','inspection_02',
   'sourceRef','internal:approved/field/log',
   'excerpt',v_excerpt_b,'excerptDigest',v_hash_b,'capturedAt',v_time)
 );
 v_permit:=altovena.request_analysis_permit(
  v_tenant,v_mission,v_actor,v_reviewer,'business','gpt-5.6',
  v_bundle_digest,900,500,7,clock_timestamp()+interval '8 minutes');

 -- No reviewer can attest a merely invented digest without source storage.
 v_blocked:=false;
 BEGIN
  INSERT INTO altovena.analysis_evidence_attestations(
   tenant_id,mission_id,evidence_digest,verified_by,source_count,state,valid_until)
  VALUES(v_tenant,v_mission,v_bundle_digest,v_reviewer,2,
   'verified',clock_timestamp()+interval '5 minutes');
 EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'unbacked_source_attestation_allowed';END IF;
 v_blocked:=false;
 BEGIN
  PERFORM altovena.save_analysis_source_bundle(v_tenant,v_mission,v_actor,
   repeat('f',64),v_sources);
 EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'forged_manifest_digest_accepted';END IF;
 v_blocked:=false;
 BEGIN
  PERFORM altovena.save_analysis_source_bundle(v_tenant,v_mission,v_reviewer,
   v_bundle_digest,v_sources);
 EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'foreign_actor_captured_sources';END IF;
 v_blocked:=false;
 BEGIN
  PERFORM altovena.save_analysis_source_bundle(v_tenant,v_mission,v_actor,
   v_bundle_digest,jsonb_set(v_sources,'{0,excerptDigest}',to_jsonb(repeat('f',64))));
 EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'tampered_source_hash_accepted';END IF;

 v_result:=altovena.save_analysis_source_bundle(
  v_tenant,v_mission,v_actor,v_bundle_digest,v_sources);
 IF v_result<>v_bundle_digest THEN RAISE EXCEPTION 'stored_bundle_digest_changed';END IF;
 SELECT count(*) INTO v_count FROM altovena.analysis_source_snapshots s
 WHERE s.tenant_id=v_tenant AND s.mission_id=v_mission;
 IF v_count<>2 THEN RAISE EXCEPTION 'snapshot_count_incorrect';END IF;
 v_blocked:=false;
 BEGIN
  UPDATE altovena.analysis_source_snapshots AS s SET excerpt='tampered'
  WHERE s.tenant_id=v_tenant AND s.mission_id=v_mission;
 EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'immutable_source_was_overwritten';END IF;
 v_blocked:=false;
 BEGIN
  PERFORM altovena.save_analysis_source_bundle(
   v_tenant,v_mission,v_actor,v_bundle_digest,v_sources);
 EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'snapshot_replacement_allowed';END IF;

 v_blocked:=false;
 BEGIN
  PERFORM altovena.attest_saved_analysis_sources(
   v_tenant,v_mission,v_actor,v_bundle_digest);
 EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'self_attestation_allowed';END IF;
 IF altovena.attest_saved_analysis_sources(
   v_tenant,v_mission,v_reviewer,v_bundle_digest)<>'attested_for_reviewer'
 THEN RAISE EXCEPTION 'reviewer_cannot_attest_valid_snapshot';END IF;
 IF altovena.review_analysis_permit(v_permit,v_reviewer,'approve')<>'approved'
 THEN RAISE EXCEPTION 'attested_permit_review_denied';END IF;
 v_blocked:=false;
 BEGIN
  PERFORM altovena.attest_saved_analysis_sources(
   v_tenant,v_mission,v_reviewer,v_bundle_digest);
 EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true;END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'approved_permit_attested_twice';END IF;
 -- No outbound tasks, model calls or brand data modifications.
 IF (SELECT count(*) FROM core.nexus_execution_tasks)<>0
 THEN RAISE EXCEPTION 'nexus_dispatch_from_source_snapshot';END IF;
END;
$test$;
SELECT 'Authorized snapshot hash, tenant isolation, independent source attestation passed' AS result;
