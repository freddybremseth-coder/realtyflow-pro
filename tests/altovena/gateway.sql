\set ON_ERROR_STOP on

DO $$
DECLARE can_execute boolean; n integer;
BEGIN
 IF NOT has_function_privilege('service_role',
   'public.altovena_internal_command_create_draft(text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role',
   'public.altovena_internal_command_list(integer)','EXECUTE')
 THEN RAISE EXCEPTION 'service_role missing narrow gateway access'; END IF;
 IF has_function_privilege('anon',
   'public.altovena_internal_command_create_draft(text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.altovena_internal_command_list(integer)','EXECUTE')
 OR has_schema_privilege('service_role','altovena','USAGE')
 THEN RAISE EXCEPTION 'gateway privilege broadening detected'; END IF;
END $$;

SET ROLE service_role;
DO $$
DECLARE n integer; created_id uuid; another_id uuid; blocked boolean;
BEGIN
 SELECT id INTO created_id FROM public.altovena_internal_command_create_draft(
 'owner@example.test','Create research plan',
 '11111111-1111-1111-1111-111111111111');
 IF created_id IS NULL THEN RAISE EXCEPTION 'Draft was not created'; END IF;
 SELECT id INTO another_id FROM public.altovena_internal_command_create_draft(
 'owner@example.test','Create research plan',
 '11111111-1111-1111-1111-111111111111');
 IF another_id <> created_id THEN RAISE EXCEPTION 'Idempotent request produced another mission'; END IF;
 SELECT count(*) INTO n FROM public.altovena_internal_command_list(50);
 IF n<>1 THEN RAISE EXCEPTION 'Expected one visible internal mission, got %',n; END IF;
 blocked:=false;
 BEGIN
  PERFORM 1 FROM public.altovena_internal_command_create_draft(
    'owner@example.test','Different goal',
    '11111111-1111-1111-1111-111111111111');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Idempotency conflict was accepted'; END IF;
 blocked:=false;
 BEGIN
  PERFORM 1 FROM public.altovena_internal_command_create_draft(
    'unknown@example.test','Unverified actor',
    '22222222-2222-2222-2222-222222222222');
 EXCEPTION WHEN raise_exception THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Unknown actor was accepted'; END IF;
END $$;
RESET ROLE;

DO $$
DECLARE n integer; other_n integer; evidence_n integer;
BEGIN
 SELECT count(*) INTO n FROM altovena.missions;
 SELECT count(*) INTO other_n FROM altovena.missions m
  JOIN altovena.tenants t ON t.id=m.tenant_id
  WHERE t.external_ref<>'host:realtyflowpro:altovena-internal';
 SELECT count(*) INTO evidence_n FROM altovena.events WHERE event_type='mission.draft_created';
 IF n<>1 OR other_n<>0 OR evidence_n<>1 THEN
   RAISE EXCEPTION 'Internal draft / audit integrity failed: n %, other %, events %',
      n,other_n,evidence_n;
 END IF;
END $$;

SET ROLE anon;
DO $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM 1 FROM public.altovena_internal_command_list(50);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous RPC access allowed'; END IF;
END $$;
RESET ROLE;
SELECT 'Altovena RealtyFlow owner-only RPC integration passed' AS result;
