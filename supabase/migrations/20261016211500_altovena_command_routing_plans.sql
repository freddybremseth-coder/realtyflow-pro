-- Command planning v0.2: persistent agent ROUTING PROPOSALS ONLY.
-- The catalog supplies suggested agent identities; this code NEVER dispatches.
BEGIN;

CREATE TABLE altovena.mission_route_plans (
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  proposed_by uuid NOT NULL,
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan)='object'),
  status text NOT NULL DEFAULT 'proposed' CHECK (status='proposed'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,mission_id),
  FOREIGN KEY (tenant_id,mission_id) REFERENCES altovena.missions(tenant_id,id)
);
ALTER TABLE altovena.mission_route_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON altovena.mission_route_plans FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.altovena_internal_command_plan_get(p_mission_id uuid)
RETURNS TABLE(mission_id uuid, plan jsonb, status text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE v_tenant uuid;
BEGIN
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 JOIN altovena.tenant_products tp ON tp.tenant_id=t.id AND tp.product_slug='command'
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
 AND t.status='active' AND tp.status='active';
 IF v_tenant IS NULL OR p_mission_id IS NULL THEN
   RAISE EXCEPTION 'internal_mission_unavailable';
 END IF;
 RETURN QUERY SELECT p.mission_id,p.plan,p.status,p.created_at
 FROM altovena.mission_route_plans p
 WHERE p.tenant_id=v_tenant AND p.mission_id=p_mission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.altovena_internal_command_plan_propose(
  p_actor_email text, p_mission_id uuid, p_plan jsonb
)
RETURNS TABLE(mission_id uuid, plan jsonb, status text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE
 v_tenant uuid;
 v_actor uuid;
 v_mission altovena.missions%ROWTYPE;
 v_inserted integer;
 v_current jsonb;
BEGIN
 IF p_mission_id IS NULL OR p_actor_email IS NULL OR p_plan IS NULL
   OR jsonb_typeof(p_plan)<>'object' OR length(p_plan::text)>18000
 THEN RAISE EXCEPTION 'invalid_plan' USING ERRCODE='22023'; END IF;
 IF p_plan->>'mode' IS DISTINCT FROM 'ROUTING_PROPOSAL_ONLY'
    OR p_plan->>'source' IS DISTINCT FROM 'realtyflow-nexus-agent-fleet'
    OR p_plan->>'missionId' IS DISTINCT FROM p_mission_id::text
    OR (p_plan->'controls'->>'approvedForExecution') IS DISTINCT FROM 'false'
    OR (p_plan->'controls'->>'permittedExternalActions') IS DISTINCT FROM 'false'
    OR p_plan->'controls'->'allowedTools' IS DISTINCT FROM '[]'::jsonb
    OR p_plan->'controls'->>'requiresHumanReview' IS DISTINCT FROM 'true'
    OR jsonb_typeof(p_plan->'agents') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'unsafe_plan' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_plan->'agents') NOT BETWEEN 1 AND 3
 THEN RAISE EXCEPTION 'invalid_agent_count' USING ERRCODE='22023'; END IF;
 IF EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_plan->'agents') agent
   WHERE agent->>'executionStatus' IS DISTINCT FROM 'not_started'
 ) THEN RAISE EXCEPTION 'unsafe_agent_status' USING ERRCODE='22023'; END IF;

 SELECT t.id INTO v_tenant FROM altovena.tenants t
 JOIN altovena.tenant_products tp ON tp.tenant_id=t.id AND tp.product_slug='command'
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
 AND t.status='active' AND tp.status='active';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'internal_tenant_unavailable'; END IF;

 SELECT u.id INTO v_actor FROM auth.users u
 WHERE lower(u.email)=lower(btrim(p_actor_email))
 AND u.email_confirmed_at IS NOT NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'verified_actor_not_found'; END IF;
 SELECT * INTO v_mission FROM altovena.missions m
 WHERE m.tenant_id=v_tenant AND m.id=p_mission_id AND m.product_slug='command'
 AND m.state='draft' AND m.created_by=v_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'mission_not_owned_or_not_draft'; END IF;

 -- Only once per mission: one canonical proposal. Repeated identical calls are
 -- idempotent, changed payloads fail (no accidental overwrite of reviewed plan).
 INSERT INTO altovena.mission_route_plans(tenant_id,mission_id,proposed_by,plan)
 VALUES(v_tenant,p_mission_id,v_actor,p_plan)
 ON CONFLICT (tenant_id,mission_id) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 IF v_inserted=1 THEN
    INSERT INTO altovena.events(tenant_id,mission_id,event_type,payload)
    VALUES(v_tenant,p_mission_id,'mission.routing_proposed',
      jsonb_build_object('actor_id',v_actor::text,'source','nexus-registry','execution','none'));
 ELSE
    SELECT p.plan INTO v_current FROM altovena.mission_route_plans p
    WHERE p.tenant_id=v_tenant AND p.mission_id=p_mission_id;
    IF v_current IS DISTINCT FROM p_plan THEN
      RAISE EXCEPTION 'plan_already_exists' USING ERRCODE='22023';
    END IF;
 END IF;

 RETURN QUERY SELECT p.mission_id,p.plan,p.status,p.created_at
 FROM altovena.mission_route_plans p
 WHERE p.tenant_id=v_tenant AND p.mission_id=p_mission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.altovena_internal_command_plan_get(uuid)
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.altovena_internal_command_plan_propose(text,uuid,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_plan_get(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_plan_propose(text,uuid,jsonb) TO service_role;


-- Retrieve only the target internal draft for owner-authenticated planning.
CREATE OR REPLACE FUNCTION public.altovena_internal_command_plan_input(p_mission_id uuid)
RETURNS TABLE(id uuid, goal text, state text, created_by uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $
DECLARE v_tenant uuid;
BEGIN
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 JOIN altovena.tenant_products tp ON tp.tenant_id=t.id AND tp.product_slug='command'
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
 AND t.status='active' AND tp.status='active';
 IF v_tenant IS NULL OR p_mission_id IS NULL THEN
   RAISE EXCEPTION 'internal_mission_unavailable';
 END IF;
 RETURN QUERY SELECT m.id,m.goal,m.state,m.created_by FROM altovena.missions m
 WHERE m.tenant_id=v_tenant AND m.id=p_mission_id AND m.product_slug='command'
 AND m.state='draft';
END;
$;
REVOKE ALL ON FUNCTION public.altovena_internal_command_plan_input(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_plan_input(uuid)
 TO service_role;

COMMIT;
