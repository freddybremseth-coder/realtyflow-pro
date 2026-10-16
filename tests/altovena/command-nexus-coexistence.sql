\set ON_ERROR_STOP on
-- If either system implicitly turns a routing proposal into an executable
-- task, or exposes a protected table to anonymous users, fail the combined CI.
DO $$
BEGIN
  IF (SELECT count(*) FROM altovena.mission_route_plans) <> 1
    THEN RAISE EXCEPTION 'Missing Altovena routing proposal'; END IF;
  IF (SELECT count(*) FROM altovena.tasks) <> 0
    THEN RAISE EXCEPTION 'Altovena routing accidentally started tasks'; END IF;
  IF (SELECT count(*) FROM core.nexus_execution_tasks) <> 0
    THEN RAISE EXCEPTION 'Command routing unexpectedly created Nexus tasks'; END IF;
  IF (SELECT count(*) FROM core.nexus_execution_claims) <> 0
    THEN RAISE EXCEPTION 'Command routing unexpectedly reserved Nexus claims'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class
    WHERE oid='altovena.mission_route_plans'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class
    WHERE oid='core.nexus_execution_tasks'::regclass)
    THEN RAISE EXCEPTION 'Required RLS not enabled'; END IF;
  IF has_table_privilege('anon','altovena.mission_route_plans','SELECT')
    OR has_table_privilege('authenticated','core.nexus_execution_tasks','SELECT')
    OR has_table_privilege('service_role','altovena.mission_route_plans','SELECT')
    THEN RAISE EXCEPTION 'Protected cross-product data unexpectedly exposed'; END IF;
  IF has_function_privilege('anon',
    'public.altovena_internal_command_plan_propose(text,uuid,jsonb)','EXECUTE')
    THEN RAISE EXCEPTION 'Public Command planning privileges broadened'; END IF;
END $$;
SELECT 'Command and Nexus isolated schemas coexist; no execution bridge or widened grants' AS result;
