\set ON_ERROR_STOP on

DO $$
BEGIN
 IF NOT has_function_privilege('service_role',
   'public.altovena_internal_command_analysis_prepare(uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.altovena_internal_command_analysis_get(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Analysis preparation RPC missing'; END IF;
 IF has_function_privilege('anon',
   'public.altovena_internal_command_analysis_prepare(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.altovena_internal_command_analysis_get(uuid,text)','EXECUTE')
 OR has_table_privilege('service_role','altovena.mission_analysis_preparations','SELECT')
 THEN RAISE EXCEPTION 'Analysis preparation access unexpectedly broad'; END IF;
END $$;

SET ROLE service_role;
DO $$
DECLARE v_mission uuid; v_row record; v_count integer; v_denied boolean;
BEGIN
 SELECT id INTO v_mission FROM public.altovena_internal_command_list(10) LIMIT 1;
 IF v_mission IS NULL THEN RAISE EXCEPTION 'Missing mission fixture'; END IF;
 SELECT * INTO v_row FROM public.altovena_internal_command_analysis_prepare(
   v_mission,'owner@example.test');
 IF v_row.state <> 'prepared' OR v_row.agent_count <> 1
    OR v_row.max_model_calls <> 0 OR v_row.max_cost_cents <> 0
 THEN RAISE EXCEPTION 'Unsafe prepared analysis receipt'; END IF;
 PERFORM * FROM public.altovena_internal_command_analysis_prepare(v_mission,'owner@example.test');
 SELECT count(*) INTO v_count FROM public.altovena_internal_command_analysis_get(
  v_mission,'owner@example.test');
 IF v_count<>1 THEN RAISE EXCEPTION 'Readback missing'; END IF;
 v_denied:=false;
 BEGIN
   PERFORM * FROM public.altovena_internal_command_analysis_prepare(
    v_mission,'wrong@example.test');
 EXCEPTION WHEN raise_exception THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Foreign actor prepared mission'; END IF;
 v_denied:=false;
 BEGIN
   PERFORM * FROM public.altovena_internal_command_analysis_prepare(
    '11111111-2222-4333-8444-555555555555','owner@example.test');
 EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Missing mission accepted'; END IF;
END $$;
RESET ROLE;

DO $$
DECLARE v_mission uuid; v_count integer; v_blocked boolean; v_safe jsonb;
BEGIN
 SELECT id INTO v_mission FROM altovena.missions LIMIT 1;
 SELECT count(*) INTO v_count FROM altovena.mission_analysis_preparations;
 IF v_count<>1 THEN RAISE EXCEPTION 'Non-idempotent analysis preparation'; END IF;
 SELECT count(*) INTO v_count FROM altovena.events
 WHERE event_type='mission.analysis_prepared';
 IF v_count<>1 THEN RAISE EXCEPTION 'Duplicate analysis audit events'; END IF;
 SELECT count(*) INTO v_count FROM altovena.tasks;
 IF v_count<>0 THEN RAISE EXCEPTION 'Analysis preparation ran Altovena tasks'; END IF;
 SELECT count(*) INTO v_count FROM core.nexus_execution_tasks;
 IF v_count<>0 THEN RAISE EXCEPTION 'Analysis preparation ran Nexus tasks'; END IF;
 SELECT count(*) INTO v_count FROM core.nexus_execution_claims;
 IF v_count<>0 THEN RAISE EXCEPTION 'Analysis preparation reserved Nexus claim'; END IF;
 v_blocked:=false;
 BEGIN
   UPDATE altovena.mission_analysis_preparations
    SET state='prepared' WHERE mission_id=v_mission;
 EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'Prepared row mutable'; END IF;

 SELECT plan INTO v_safe FROM altovena.mission_route_plans
 WHERE mission_id=v_mission;
 UPDATE altovena.mission_route_plans
 SET plan=jsonb_set(v_safe,'{controls,approvedForExecution}','true'::jsonb)
 WHERE mission_id=v_mission;
 v_blocked:=false;
 BEGIN
   PERFORM * FROM public.altovena_internal_command_analysis_prepare(
    v_mission,'owner@example.test');
 EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'Approval spoofing reached analysis'; END IF;
 UPDATE altovena.mission_route_plans SET plan=v_safe WHERE mission_id=v_mission;

 -- A safe-but-changed routing document can never silently replace a prepared request.
 UPDATE altovena.mission_route_plans
 SET plan=jsonb_set(v_safe,'{note}','"changed plan digest"'::jsonb)
 WHERE mission_id=v_mission;
 v_blocked:=false;
 BEGIN
   PERFORM * FROM public.altovena_internal_command_analysis_prepare(
    v_mission,'owner@example.test');
 EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'Prepared plan digest changed without conflict'; END IF;
 UPDATE altovena.mission_route_plans SET plan=v_safe WHERE mission_id=v_mission;
END $$;
SELECT 'Analysis preparation persists once, cannot execute, rejects owner and plan spoofing' AS result;
