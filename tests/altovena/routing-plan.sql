\set ON_ERROR_STOP on

DO $$
BEGIN
 IF NOT has_function_privilege('service_role',
 'public.altovena_internal_command_plan_propose(text,uuid,jsonb)','EXECUTE')
 OR NOT has_function_privilege('service_role',
 'public.altovena_internal_command_plan_get(uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
 'public.altovena_internal_command_plan_input(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Internal planning RPC not exposed to server gateway';
 END IF;
 IF has_function_privilege('anon',
 'public.altovena_internal_command_plan_propose(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.altovena_internal_command_plan_propose(text,uuid,jsonb)','EXECUTE')
 OR has_table_privilege('service_role','altovena.mission_route_plans','SELECT') THEN
  RAISE EXCEPTION 'Unexpected privilege broadening';
 END IF;
END $$;

SET ROLE service_role;
DO $$
DECLARE
 v_mission uuid;
 v_plan jsonb;
 v_count integer;
 v_saved jsonb;
 v_changed jsonb;
 blocked boolean;
BEGIN
 SELECT id INTO v_mission FROM public.altovena_internal_command_list(10) LIMIT 1;
 IF v_mission IS NULL THEN RAISE EXCEPTION 'Fixture mission missing'; END IF;

 IF (SELECT count(*) FROM public.altovena_internal_command_plan_input(v_mission)) <> 1 THEN
   RAISE EXCEPTION 'Cannot locate internal target draft'; END IF;
 v_plan := jsonb_build_object(
   'schemaVersion',1,
   'source','realtyflow-nexus-agent-fleet',
   'mode','ROUTING_PROPOSAL_ONLY',
   'missionId',v_mission::text,
   'goalDigest',encode(sha256(convert_to('Create research plan','UTF8')),'hex'),
   'agents',jsonb_build_array(jsonb_build_object(
     'agentId','business','agentName','Morgan Business Strategist',
     'executionStatus','not_started')),
   'controls',jsonb_build_object(
     'requiresHumanReview',true,
     'approvedForExecution',false,
     'permittedExternalActions',false,
     'allowedTools',jsonb_build_array()
   )
 );
 SELECT plan INTO v_saved FROM public.altovena_internal_command_plan_propose(
   'owner@example.test',v_mission,v_plan
 );
 IF v_saved IS DISTINCT FROM v_plan THEN RAISE EXCEPTION 'Saved proposal changed'; END IF;
 SELECT count(*) INTO v_count FROM public.altovena_internal_command_plan_get(v_mission);
 IF v_count <> 1 THEN RAISE EXCEPTION 'Saved proposal is not readable'; END IF;
 PERFORM 1 FROM public.altovena_internal_command_plan_propose(
   'owner@example.test',v_mission,v_plan
 );
 SELECT count(*) INTO v_count FROM public.altovena_internal_command_plan_get(v_mission);
 IF v_count<>1 THEN RAISE EXCEPTION 'Duplicate plan created'; END IF;

 v_changed := jsonb_set(v_plan,'{note}','"Modified without review"'::jsonb);
 blocked:=false;
 BEGIN
   PERFORM 1 FROM public.altovena_internal_command_plan_propose(
     'owner@example.test',v_mission,v_changed);
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Conflicting proposal update was allowed'; END IF;

 v_changed := jsonb_set(v_plan,'{controls,approvedForExecution}','true'::jsonb);
 blocked:=false;
 BEGIN
   PERFORM 1 FROM public.altovena_internal_command_plan_propose(
     'owner@example.test',v_mission,v_changed);
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'External execution grant was allowed'; END IF;

 v_changed := v_plan - 'agents';
 blocked:=false;
 BEGIN
   PERFORM 1 FROM public.altovena_internal_command_plan_propose(
     'owner@example.test',v_mission,v_changed);
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Malformed agent list was allowed'; END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_n integer;
BEGIN
 SELECT count(*) INTO v_n FROM altovena.mission_route_plans;
 IF v_n<>1 THEN RAISE EXCEPTION 'Expected one persisted plan'; END IF;
 SELECT count(*) INTO v_n FROM altovena.events
 WHERE event_type='mission.routing_proposed';
 IF v_n<>1 THEN RAISE EXCEPTION 'Repeated proposals wrote multiple audit events'; END IF;
 SELECT count(*) INTO v_n FROM altovena.tasks;
 IF v_n<>0 THEN RAISE EXCEPTION 'Planning executed tasks unexpectedly'; END IF;
 IF EXISTS(SELECT 1 FROM altovena.mission_route_plans WHERE status<>'proposed')
 THEN RAISE EXCEPTION 'Plan unexpectedly approved'; END IF;
END $$;
SELECT 'Altovena Nexus routing proposal is persisted, gated, idempotent and nonexecuting' AS result;
