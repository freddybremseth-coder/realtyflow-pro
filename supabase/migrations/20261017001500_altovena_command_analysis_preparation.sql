-- Altovena Command -> Nexus analysis PREPARATION ONLY.
-- Unapplied migration; no worker, model API, tools, external action or permission grants.
-- A prepared request is not a Nexus execution task, approval, or execution permit.
BEGIN;

CREATE TABLE altovena.mission_analysis_preparations (
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  prepared_by uuid NOT NULL,
  routing_digest text NOT NULL CHECK (routing_digest ~ '^[a-f0-9]{64}$'),
  agent_count smallint NOT NULL CHECK (agent_count BETWEEN 1 AND 3),
  state text NOT NULL DEFAULT 'prepared' CHECK (state='prepared'),
  max_model_calls integer NOT NULL DEFAULT 0 CHECK (max_model_calls=0),
  max_cost_cents bigint NOT NULL DEFAULT 0 CHECK (max_cost_cents=0),
  permitted_external_actions boolean NOT NULL DEFAULT false
    CHECK (permitted_external_actions=false),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,mission_id),
  FOREIGN KEY (tenant_id,mission_id)
    REFERENCES altovena.mission_route_plans(tenant_id,mission_id)
);
ALTER TABLE altovena.mission_analysis_preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON altovena.mission_analysis_preparations
  FROM PUBLIC,anon,authenticated,service_role;

-- Status is deliberately immutable. Future workers must use their own separately
-- reviewed and versioned schema/API, never silently reinterpret this row as approved.
CREATE OR REPLACE FUNCTION altovena.reject_analysis_preparation_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'analysis_preparation_immutable' USING ERRCODE='22023';
END;
$$;
REVOKE ALL ON FUNCTION altovena.reject_analysis_preparation_mutation()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER altovena_analysis_preparations_immutable
BEFORE UPDATE OR DELETE ON altovena.mission_analysis_preparations
FOR EACH ROW EXECUTE FUNCTION altovena.reject_analysis_preparation_mutation();

CREATE OR REPLACE FUNCTION public.altovena_internal_command_analysis_get(
  p_mission_id uuid, p_actor_email text
)
RETURNS TABLE(mission_id uuid,state text,agent_count smallint,
  max_model_calls integer,max_cost_cents bigint,prepared_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_actor uuid;
BEGIN
 IF p_mission_id IS NULL OR p_actor_email IS NULL THEN
   RAISE EXCEPTION 'invalid_analysis_request' USING ERRCODE='22023'; END IF;
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 JOIN altovena.tenant_products tp ON tp.tenant_id=t.id
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
  AND t.status='active' AND tp.product_slug='command' AND tp.status='active';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'internal_tenant_unavailable'; END IF;
 SELECT u.id INTO v_actor FROM auth.users u
 WHERE lower(u.email)=lower(btrim(p_actor_email))
   AND u.email_confirmed_at IS NOT NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'verified_actor_not_found'; END IF;
 RETURN QUERY SELECT a.mission_id,a.state,a.agent_count,
   a.max_model_calls,a.max_cost_cents,a.prepared_at
 FROM altovena.mission_analysis_preparations a
 JOIN altovena.missions m ON m.tenant_id=a.tenant_id AND m.id=a.mission_id
 WHERE a.tenant_id=v_tenant AND a.mission_id=p_mission_id
   AND m.product_slug='command' AND m.created_by=v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.altovena_internal_command_analysis_prepare(
  p_mission_id uuid,p_actor_email text
)
RETURNS TABLE(mission_id uuid,state text,agent_count smallint,
  max_model_calls integer,max_cost_cents bigint,prepared_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 v_tenant uuid; v_actor uuid;
 v_mission altovena.missions%ROWTYPE;
 v_plan jsonb; v_digest text; v_count smallint;
 v_existing altovena.mission_analysis_preparations%ROWTYPE;
 v_inserted integer;
BEGIN
 IF p_mission_id IS NULL OR p_actor_email IS NULL
  OR length(btrim(p_actor_email)) NOT BETWEEN 3 AND 320 THEN
   RAISE EXCEPTION 'invalid_analysis_request' USING ERRCODE='22023'; END IF;
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 JOIN altovena.tenant_products tp ON tp.tenant_id=t.id
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
  AND t.status='active' AND tp.product_slug='command' AND tp.status='active';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'internal_tenant_unavailable'; END IF;
 SELECT u.id INTO v_actor FROM auth.users u
 WHERE lower(u.email)=lower(btrim(p_actor_email))
  AND u.email_confirmed_at IS NOT NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'verified_actor_not_found'; END IF;
 SELECT * INTO v_mission FROM altovena.missions m
 WHERE m.tenant_id=v_tenant AND m.id=p_mission_id
  AND m.product_slug='command' AND m.created_by=v_actor AND m.state='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'mission_not_available' USING ERRCODE='22023'; END IF;
 SELECT p.plan INTO v_plan FROM altovena.mission_route_plans p
 WHERE p.tenant_id=v_tenant AND p.mission_id=p_mission_id AND p.status='proposed';
 IF v_plan IS NULL
 OR v_plan->>'mode' IS DISTINCT FROM 'ROUTING_PROPOSAL_ONLY'
 OR v_plan->>'source' IS DISTINCT FROM 'realtyflow-nexus-agent-fleet'
 OR v_plan->>'missionId' IS DISTINCT FROM p_mission_id::text
 OR v_plan->'controls'->>'requiresHumanReview' IS DISTINCT FROM 'true'
 OR v_plan->'controls'->>'approvedForExecution' IS DISTINCT FROM 'false'
 OR v_plan->'controls'->>'permittedExternalActions' IS DISTINCT FROM 'false'
 OR v_plan->'controls'->'allowedTools' IS DISTINCT FROM '[]'::jsonb
 OR jsonb_typeof(v_plan->'agents') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'unsafe_routing_plan' USING ERRCODE='22023'; END IF;
 v_count:=jsonb_array_length(v_plan->'agents');
 IF v_count NOT BETWEEN 1 AND 3 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(v_plan->'agents') AS agent(value)
   WHERE agent.value->>'executionStatus' IS DISTINCT FROM 'not_started'
      OR NULLIF(btrim(agent.value->>'agentId'),'') IS NULL
 ) THEN RAISE EXCEPTION 'unsafe_agent_list' USING ERRCODE='22023'; END IF;
 -- PostgreSQL builtin SHA-256. No external crypto extension required.
 v_digest:=encode(sha256(convert_to(v_plan::text,'UTF8')),'hex');
 INSERT INTO altovena.mission_analysis_preparations(
  tenant_id,mission_id,prepared_by,routing_digest,agent_count)
 VALUES(v_tenant,p_mission_id,v_actor,v_digest,v_count)
 ON CONFLICT (tenant_id,mission_id) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 SELECT * INTO v_existing FROM altovena.mission_analysis_preparations p
 WHERE p.tenant_id=v_tenant AND p.mission_id=p_mission_id;
 IF v_existing.routing_digest IS DISTINCT FROM v_digest
    OR v_existing.prepared_by IS DISTINCT FROM v_actor THEN
   RAISE EXCEPTION 'analysis_preparation_conflict' USING ERRCODE='22023'; END IF;
 IF v_inserted=1 THEN
   INSERT INTO altovena.events(tenant_id,mission_id,event_type,payload)
   VALUES(v_tenant,p_mission_id,'mission.analysis_prepared',
    jsonb_build_object('actor_id',v_actor::text,'routing_digest',v_digest,
      'agent_count',v_count,'model_calls',0,'external_actions',0));
 END IF;
 RETURN QUERY SELECT p.mission_id,p.state,p.agent_count,
  p.max_model_calls,p.max_cost_cents,p.prepared_at
 FROM altovena.mission_analysis_preparations p
 WHERE p.tenant_id=v_tenant AND p.mission_id=p_mission_id;
END;
$$;
REVOKE ALL ON FUNCTION public.altovena_internal_command_analysis_get(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.altovena_internal_command_analysis_prepare(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_analysis_get(uuid,text)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_analysis_prepare(uuid,text)
 TO service_role;
COMMIT;
