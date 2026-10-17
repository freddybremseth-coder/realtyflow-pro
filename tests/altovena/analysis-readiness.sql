\set ON_ERROR_STOP on
-- Disposable PostgreSQL; tests permission-gated READ access only.
DO $test$
DECLARE v_tenant uuid;v_mission uuid;
BEGIN
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 WHERE t.external_ref='host:realtyflowpro:altovena-internal';
 SELECT b.mission_id INTO v_mission FROM altovena.analysis_source_bundles b
 WHERE b.tenant_id=v_tenant LIMIT 1;
 IF v_mission IS NULL THEN RAISE EXCEPTION 'missing_source_bundle_fixture';END IF;
 IF has_function_privilege('anon',
    'public.altovena_internal_command_analysis_status(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
    'public.altovena_internal_command_analysis_status(uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
    'public.altovena_internal_command_analysis_status(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'analysis_readiness_grant_incorrect';END IF;
END;
$test$;

SET ROLE service_role;
DO $test$
DECLARE v_mission uuid;v_rec record;v_denied boolean;
BEGIN
 SELECT m.id INTO v_mission FROM public.altovena_internal_command_list(100) m
 WHERE m.goal LIKE 'Analyze synthetic previously authorized%' LIMIT 1;
 IF v_mission IS NULL THEN RAISE EXCEPTION 'missing_owned_source_mission';END IF;
 SELECT * INTO v_rec FROM public.altovena_internal_command_analysis_status(
  v_mission,'owner@example.test');
 IF v_rec.mission_id IS DISTINCT FROM v_mission
 OR v_rec.preparation_status<>'prepared'
 OR v_rec.source_status<>'independently_attested'
 OR v_rec.source_count<>2
 OR v_rec.permit_status<>'approved_for_read_only_analysis'
 OR v_rec.review_status<>'approved'
 OR v_rec.execution_enabled<>false
 THEN RAISE EXCEPTION 'readiness_status_did_not_match_real_db_state';END IF;
 v_denied:=false;
 BEGIN
  PERFORM * FROM public.altovena_internal_command_analysis_status(
   v_mission,'other@example.test');
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;END;
 IF NOT v_denied THEN RAISE EXCEPTION 'foreign_actor_readiness_disclosed';END IF;
 v_denied:=false;
 BEGIN
  PERFORM * FROM public.altovena_internal_command_analysis_status(
   '11111111-1111-4111-8111-111111111111','owner@example.test');
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;END;
 IF NOT v_denied THEN RAISE EXCEPTION 'unknown_mission_readiness_disclosed';END IF;
END;
$test$;
RESET ROLE;
SELECT 'Owner analysis readiness is read-only, access scoped and evidence-backed' AS result;
