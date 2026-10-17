-- PRIVATE review flow. Development migration only. No production apply or API grants.
-- Source attestations are not populated by application code. Until a separately
-- authenticated source-ingest service is approved, live issuance stays disabled.
BEGIN;

CREATE TABLE altovena.analysis_evidence_attestations (
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  verified_by uuid NOT NULL REFERENCES auth.users(id),
  source_count smallint NOT NULL CHECK (source_count BETWEEN 1 AND 12),
  state text NOT NULL CHECK (state IN ('verified','revoked')),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz NOT NULL,
  PRIMARY KEY (tenant_id,mission_id,evidence_digest),
  FOREIGN KEY (tenant_id,mission_id) REFERENCES altovena.missions(tenant_id,id),
  CHECK (valid_until > verified_at AND valid_until <= verified_at + interval '15 minutes')
);

CREATE TABLE altovena.analysis_permit_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES altovena.tenants(id),
  permit_id uuid NOT NULL REFERENCES altovena.analysis_permits(id),
  event_type text NOT NULL CHECK (event_type IN ('requested','approved','rejected')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (permit_id,event_type)
);

CREATE TRIGGER altovena_analysis_review_events_immutable
BEFORE UPDATE OR DELETE ON altovena.analysis_permit_review_events
FOR EACH ROW EXECUTE FUNCTION altovena.reject_analysis_budget_event_mutation();

CREATE OR REPLACE FUNCTION altovena.request_analysis_permit(
 p_tenant_id uuid,p_mission_id uuid,p_actor_id uuid,p_reviewer_id uuid,
 p_agent_id text,p_model text,p_evidence_digest text,
 p_max_input_tokens integer,p_max_output_tokens integer,
 p_reserved_cost_cents bigint,p_expires_at timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
DECLARE v_mission altovena.missions%ROWTYPE;
 v_plan altovena.mission_route_plans%ROWTYPE;
 v_preparation altovena.mission_analysis_preparations%ROWTYPE;
 v_existing altovena.analysis_permits%ROWTYPE;
 v_goal text;v_route text;v_id uuid;
BEGIN
 IF p_tenant_id IS NULL OR p_mission_id IS NULL OR p_actor_id IS NULL
 OR p_reviewer_id IS NULL OR p_actor_id=p_reviewer_id
 OR p_agent_id IS NULL OR p_agent_id !~ '^[A-Za-z0-9:_-]{1,128}$'
 OR p_model IS NULL OR p_model !~ '^gpt-[a-z0-9.-]{2,48}$'
 OR p_evidence_digest IS NULL OR p_evidence_digest !~ '^[a-f0-9]{64}$'
 OR p_max_input_tokens IS NULL OR p_max_input_tokens NOT BETWEEN 100 AND 1200
 OR p_max_output_tokens IS NULL OR p_max_output_tokens NOT BETWEEN 100 AND 700
 OR p_reserved_cost_cents IS NULL OR p_reserved_cost_cents NOT BETWEEN 1 AND 20
 OR p_expires_at IS NULL OR p_expires_at <= clock_timestamp()+interval '30 seconds'
 OR p_expires_at > clock_timestamp()+interval '15 minutes'
 THEN RAISE EXCEPTION 'analysis_permit_request_invalid' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM altovena.tenants t
   JOIN altovena.tenant_products tp ON tp.tenant_id=t.id
  WHERE t.id=p_tenant_id AND t.status='active'
   AND tp.product_slug='command' AND tp.status='active'
 ) OR NOT EXISTS(
  SELECT 1 FROM altovena.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=p_actor_id
  AND m.active=true AND m.role IN ('owner','admin','operator')
 ) OR NOT EXISTS(
  SELECT 1 FROM altovena.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=p_reviewer_id
  AND m.active=true AND m.role IN ('owner','admin')
 ) THEN RAISE EXCEPTION 'analysis_permit_membership_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_mission FROM altovena.missions m
  WHERE m.tenant_id=p_tenant_id AND m.id=p_mission_id
   AND m.created_by=p_actor_id AND m.product_slug='command' AND m.state='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'analysis_mission_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_plan FROM altovena.mission_route_plans p
 WHERE p.tenant_id=p_tenant_id AND p.mission_id=p_mission_id
 AND p.status='proposed';
 SELECT * INTO v_preparation FROM altovena.mission_analysis_preparations a
 WHERE a.tenant_id=p_tenant_id AND a.mission_id=p_mission_id
 AND a.prepared_by=p_actor_id AND a.state='prepared';
 v_goal:=encode(sha256(convert_to(btrim(v_mission.goal),'UTF8')),'hex');
 v_route:=encode(sha256(convert_to(v_plan.plan::text,'UTF8')),'hex');
 IF v_plan.plan IS NULL OR v_preparation.mission_id IS NULL
 OR v_preparation.routing_digest IS DISTINCT FROM v_route
 OR v_plan.plan->>'goalDigest' IS DISTINCT FROM v_goal
 OR v_plan.plan->>'missionId' IS DISTINCT FROM p_mission_id::text
 OR v_plan.plan->'controls'->>'approvedForExecution' IS DISTINCT FROM 'false'
 OR v_plan.plan->'controls'->>'permittedExternalActions' IS DISTINCT FROM 'false'
 OR v_plan.plan->'controls'->'allowedTools' IS DISTINCT FROM '[]'::jsonb
 OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_plan.plan->'agents') AS agent(value)
  WHERE agent.value->>'agentId'=p_agent_id
    AND agent.value->>'executionStatus'='not_started'
 ) THEN RAISE EXCEPTION 'analysis_preparation_untrusted' USING ERRCODE='42501'; END IF;
 -- Existing pending requests are idempotent only when *all* material values
 -- match. Never overwrite a decision or reopen a revoked/expired permit.
 SELECT * INTO v_existing FROM altovena.analysis_permits p
 WHERE p.tenant_id=p_tenant_id AND p.mission_id=p_mission_id FOR UPDATE;
 IF FOUND THEN
  IF v_existing.state <> 'pending'
   OR v_existing.actor_id<>p_actor_id OR v_existing.reviewer_id<>p_reviewer_id
   OR v_existing.agent_id<>p_agent_id OR v_existing.model<>p_model
   OR v_existing.goal_digest<>v_goal OR v_existing.routing_digest<>v_route
   OR v_existing.evidence_digest<>p_evidence_digest
   OR v_existing.max_input_tokens<>p_max_input_tokens
   OR v_existing.max_output_tokens<>p_max_output_tokens
   OR v_existing.reserved_cost_cents<>p_reserved_cost_cents
   OR v_existing.expires_at<>p_expires_at
  THEN RAISE EXCEPTION 'analysis_permit_request_conflict' USING ERRCODE='22023'; END IF;
  RETURN v_existing.id;
 END IF;
 INSERT INTO altovena.analysis_permits(
  tenant_id,mission_id,actor_id,reviewer_id,agent_id,model,
  goal_digest,routing_digest,evidence_digest,max_input_tokens,
  max_output_tokens,reserved_cost_cents,expires_at
 ) VALUES(
  p_tenant_id,p_mission_id,p_actor_id,p_reviewer_id,p_agent_id,p_model,
  v_goal,v_route,p_evidence_digest,p_max_input_tokens,
  p_max_output_tokens,p_reserved_cost_cents,p_expires_at
 ) RETURNING id INTO v_id;
 INSERT INTO altovena.analysis_permit_review_events(
  tenant_id,permit_id,event_type,actor_id,evidence_digest
 ) VALUES(p_tenant_id,v_id,'requested',p_actor_id,p_evidence_digest);
 RETURN v_id;
END;
$body$;

CREATE OR REPLACE FUNCTION altovena.review_analysis_permit(
 p_permit_id uuid,p_reviewer_id uuid,p_decision text
)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
DECLARE v_permit altovena.analysis_permits%ROWTYPE;
 v_mission altovena.missions%ROWTYPE;
 v_preparation altovena.mission_analysis_preparations%ROWTYPE;
 v_route altovena.mission_route_plans%ROWTYPE;
 v_month date := date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
 IF p_permit_id IS NULL OR p_reviewer_id IS NULL
  OR p_decision IS NULL OR p_decision NOT IN ('approve','reject')
 THEN RAISE EXCEPTION 'analysis_review_invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_permit FROM altovena.analysis_permits p
 WHERE p.id=p_permit_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'analysis_permit_missing' USING ERRCODE='42501'; END IF;
 IF p_reviewer_id<>v_permit.reviewer_id OR p_reviewer_id=v_permit.actor_id
 OR NOT EXISTS(
  SELECT 1 FROM altovena.tenant_memberships m
  WHERE m.tenant_id=v_permit.tenant_id AND m.user_id=p_reviewer_id
   AND m.active=true AND m.role IN ('owner','admin')
 ) THEN RAISE EXCEPTION 'analysis_independent_reviewer_required' USING ERRCODE='42501'; END IF;
 IF v_permit.state<>'pending'
 THEN RAISE EXCEPTION 'analysis_permit_already_decided' USING ERRCODE='22023'; END IF;
 IF p_decision='reject' THEN
  UPDATE altovena.analysis_permits SET state='revoked' WHERE id=p_permit_id;
  INSERT INTO altovena.analysis_permit_review_events(
   tenant_id,permit_id,event_type,actor_id,evidence_digest)
  VALUES(v_permit.tenant_id,p_permit_id,'rejected',p_reviewer_id,v_permit.evidence_digest);
  RETURN 'rejected';
 END IF;
 IF v_permit.expires_at<=clock_timestamp()
 OR v_permit.expires_at>clock_timestamp()+interval '15 minutes'
 OR NOT EXISTS(
  SELECT 1 FROM altovena.tenants t
  JOIN altovena.tenant_products tp ON tp.tenant_id=t.id
  WHERE t.id=v_permit.tenant_id AND t.status='active'
    AND tp.product_slug='command' AND tp.status='active'
 ) OR NOT EXISTS(
  SELECT 1 FROM altovena.tenant_memberships m
  WHERE m.tenant_id=v_permit.tenant_id AND m.user_id=v_permit.actor_id
  AND m.active=true AND m.role IN ('owner','admin','operator')
 ) OR NOT EXISTS(
  SELECT 1 FROM altovena.analysis_budget_periods b
  WHERE b.tenant_id=v_permit.tenant_id AND b.period_start=v_month
   AND b.limit_cents>b.committed_cents
   AND b.limit_cents-b.committed_cents>=v_permit.reserved_cost_cents
 ) OR NOT EXISTS(
  SELECT 1 FROM altovena.analysis_evidence_attestations a
  WHERE a.tenant_id=v_permit.tenant_id AND a.mission_id=v_permit.mission_id
   AND a.evidence_digest=v_permit.evidence_digest AND a.state='verified'
   AND a.verified_by=p_reviewer_id AND a.valid_until>clock_timestamp()
   AND a.verified_at<=clock_timestamp()
 ) THEN RAISE EXCEPTION 'analysis_evidence_or_budget_unverified' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_mission FROM altovena.missions m
 WHERE m.tenant_id=v_permit.tenant_id AND m.id=v_permit.mission_id;
 SELECT * INTO v_preparation FROM altovena.mission_analysis_preparations a
 WHERE a.tenant_id=v_permit.tenant_id AND a.mission_id=v_permit.mission_id;
 SELECT * INTO v_route FROM altovena.mission_route_plans p
 WHERE p.tenant_id=v_permit.tenant_id AND p.mission_id=v_permit.mission_id;
 IF v_mission.created_by IS DISTINCT FROM v_permit.actor_id
 OR v_mission.state IS DISTINCT FROM 'draft'
 OR v_preparation.prepared_by IS DISTINCT FROM v_permit.actor_id
 OR v_preparation.state IS DISTINCT FROM 'prepared'
 OR v_preparation.routing_digest IS DISTINCT FROM v_permit.routing_digest
 OR v_route.plan->>'goalDigest' IS DISTINCT FROM v_permit.goal_digest
 OR encode(sha256(convert_to(btrim(v_mission.goal),'UTF8')),'hex') IS DISTINCT FROM v_permit.goal_digest
 OR encode(sha256(convert_to(v_route.plan::text,'UTF8')),'hex') IS DISTINCT FROM v_permit.routing_digest
 OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_route.plan->'agents') AS agent(value)
   WHERE agent.value->>'agentId'=v_permit.agent_id
     AND agent.value->>'executionStatus'='not_started'
 ) THEN RAISE EXCEPTION 'analysis_review_stale_mission' USING ERRCODE='42501'; END IF;
 UPDATE altovena.analysis_permits SET state='approved_for_read_only_analysis',
  approved_at=clock_timestamp() WHERE id=p_permit_id;
 INSERT INTO altovena.analysis_permit_review_events(
  tenant_id,permit_id,event_type,actor_id,evidence_digest)
 VALUES(v_permit.tenant_id,p_permit_id,'approved',p_reviewer_id,v_permit.evidence_digest);
 RETURN 'approved';
END;
$body$;

-- Extra insertion fence: approved row alone must not initiate budget usage.
-- A trusted source reviewer must have sealed the matching evidence snapshot.
CREATE OR REPLACE FUNCTION altovena.require_reviewed_evidence_for_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
DECLARE v_permit altovena.analysis_permits%ROWTYPE;
BEGIN
 SELECT * INTO v_permit FROM altovena.analysis_permits p
 WHERE p.id=NEW.permit_id AND p.tenant_id=NEW.tenant_id;
 IF NOT FOUND OR v_permit.state<>'approved_for_read_only_analysis'
 OR NOT EXISTS(
   SELECT 1 FROM altovena.analysis_permit_review_events e
   WHERE e.permit_id=NEW.permit_id AND e.event_type='approved'
     AND e.actor_id=v_permit.reviewer_id
 ) OR NOT EXISTS(
   SELECT 1 FROM altovena.analysis_evidence_attestations a
   WHERE a.tenant_id=NEW.tenant_id AND a.mission_id=v_permit.mission_id
   AND a.evidence_digest=NEW.evidence_digest AND a.state='verified'
     AND a.verified_by=v_permit.reviewer_id AND a.valid_until>clock_timestamp()
 ) THEN RAISE EXCEPTION 'analysis_source_approval_required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER altovena_reviewed_evidence_before_reserve
BEFORE INSERT ON altovena.analysis_reservations
FOR EACH ROW EXECUTE FUNCTION altovena.require_reviewed_evidence_for_reservation();

-- Revoking an attestation prevents all future reservations even if a permit
-- was approved. Production attestation issuance/revocation is not wired.
ALTER TABLE altovena.analysis_evidence_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.analysis_permit_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON altovena.analysis_evidence_attestations,
 altovena.analysis_permit_review_events
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE altovena.analysis_permit_review_events_id_seq
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.request_analysis_permit(
 uuid,uuid,uuid,uuid,text,text,text,integer,integer,bigint,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.review_analysis_permit(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.require_reviewed_evidence_for_reservation()
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
