-- Altovena read-only analysis quota ledger v0.1.
-- PRIVATE SCHEMA CONTRACT ONLY: no public RPC, permit issuance API, model worker
-- or customer access. This migration is NOT applied to production.
-- Historical spend is conservatively kept as the full admitted upper bound.
-- It is NOT a statement of actual provider charges or a hard billing guarantee.
BEGIN;

CREATE TABLE altovena.analysis_budget_periods (
  tenant_id uuid NOT NULL REFERENCES altovena.tenants(id),
  period_start date NOT NULL,
  limit_cents bigint NOT NULL CHECK (limit_cents BETWEEN 0 AND 10000000),
  committed_cents bigint NOT NULL DEFAULT 0 CHECK (committed_cents >= 0),
  PRIMARY KEY (tenant_id, period_start),
  CHECK (committed_cents <= limit_cents),
  CHECK (period_start = date_trunc('month', period_start::timestamp)::date)
);

CREATE TABLE altovena.analysis_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','approved_for_read_only_analysis','revoked')),
  model text NOT NULL CHECK (model ~ '^gpt-[a-z0-9.-]{2,48}$'),
  goal_digest text NOT NULL CHECK (goal_digest ~ '^[a-f0-9]{64}$'),
  routing_digest text NOT NULL CHECK (routing_digest ~ '^[a-f0-9]{64}$'),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  max_input_tokens integer NOT NULL CHECK (max_input_tokens BETWEEN 100 AND 1200),
  max_output_tokens integer NOT NULL CHECK (max_output_tokens BETWEEN 100 AND 700),
  reserved_cost_cents bigint NOT NULL CHECK (reserved_cost_cents BETWEEN 1 AND 20),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,mission_id),
  UNIQUE (id,tenant_id),
  FOREIGN KEY (tenant_id,mission_id)
    REFERENCES altovena.mission_analysis_preparations(tenant_id,mission_id),
  CHECK (actor_id <> reviewer_id),
  CHECK (state <> 'approved_for_read_only_analysis' OR approved_at IS NOT NULL),
  CHECK (expires_at <= created_at + interval '15 minutes')
);

CREATE TABLE altovena.analysis_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  permit_id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL,
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  period_start date NOT NULL,
  committed_cents bigint NOT NULL CHECK (committed_cents BETWEEN 1 AND 20),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','completed','uncertain')),
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  result_digest text CHECK (result_digest IS NULL OR result_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  settled_at timestamptz,
  FOREIGN KEY (permit_id,tenant_id)
    REFERENCES altovena.analysis_permits(id,tenant_id),
  FOREIGN KEY (tenant_id,period_start)
    REFERENCES altovena.analysis_budget_periods(tenant_id,period_start),
  CHECK (
    (state='reserved' AND settled_at IS NULL AND input_tokens IS NULL
     AND output_tokens IS NULL AND total_tokens IS NULL AND result_digest IS NULL)
    OR
    (state='uncertain' AND settled_at IS NOT NULL AND input_tokens IS NULL
     AND output_tokens IS NULL AND total_tokens IS NULL AND result_digest IS NULL)
    OR
    (state='completed' AND settled_at IS NOT NULL AND
     input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND
     total_tokens IS NOT NULL AND result_digest IS NOT NULL)
  )
);

CREATE TABLE altovena.analysis_budget_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES altovena.tenants(id),
  permit_id uuid NOT NULL REFERENCES altovena.analysis_permits(id),
  reservation_id uuid NOT NULL REFERENCES altovena.analysis_reservations(id),
  event_type text NOT NULL CHECK (event_type IN ('reserved','completed','uncertain','permit_revoked')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION altovena.reject_analysis_budget_event_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog AS $fn$
BEGIN
 RAISE EXCEPTION 'analysis_budget_events_append_only' USING ERRCODE='22023';
END;
$fn$;
CREATE TRIGGER altovena_analysis_budget_event_append_only
 BEFORE UPDATE OR DELETE ON altovena.analysis_budget_events
 FOR EACH ROW EXECUTE FUNCTION altovena.reject_analysis_budget_event_mutation();

-- Caller must be a privileged private database worker. A public session,
-- service_role/PostgREST, or generic authenticated user gets NO EXECUTE grant.
-- Reserve must run in one transaction with row locking and audit insertion.
CREATE OR REPLACE FUNCTION altovena.reserve_analysis_budget(
 p_permit_id uuid, p_tenant_id uuid, p_actor_id uuid, p_evidence_digest text
)
RETURNS TABLE(result_kind text, result_reservation_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE
 v_month date := date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date;
 v_budget altovena.analysis_budget_periods%ROWTYPE;
 v_permit altovena.analysis_permits%ROWTYPE;
 v_preparation altovena.mission_analysis_preparations%ROWTYPE;
 v_mission altovena.missions%ROWTYPE;
 v_id uuid;
BEGIN
 IF p_permit_id IS NULL OR p_tenant_id IS NULL OR p_actor_id IS NULL
   OR p_evidence_digest !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'analysis_reservation_invalid' USING ERRCODE='22023';
 END IF;
 -- Budget lock first serializes all requests for this tenant-month.
 SELECT * INTO v_budget FROM altovena.analysis_budget_periods b
 WHERE b.tenant_id=p_tenant_id AND b.period_start=v_month FOR UPDATE;
 IF NOT FOUND OR v_budget.limit_cents = 0 THEN
   RAISE EXCEPTION 'analysis_budget_missing_or_disabled' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_permit FROM altovena.analysis_permits p
 WHERE p.id=p_permit_id AND p.tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'analysis_permit_missing' USING ERRCODE='22023';
 END IF;
 IF v_permit.state <> 'approved_for_read_only_analysis'
   OR v_permit.actor_id<>p_actor_id OR v_permit.evidence_digest<>p_evidence_digest
   OR v_permit.approved_at IS NULL OR v_permit.expires_at <= clock_timestamp()
   OR v_permit.expires_at > clock_timestamp() + interval '15 minutes'
   OR v_permit.approved_at > clock_timestamp()
   OR NOT EXISTS (
     SELECT 1 FROM altovena.tenants t
       JOIN altovena.tenant_products tp ON tp.tenant_id=t.id
     WHERE t.id=p_tenant_id AND t.status='active'
       AND tp.product_slug='command' AND tp.status='active')
   OR NOT EXISTS (
     SELECT 1 FROM altovena.tenant_memberships m
     WHERE m.tenant_id=p_tenant_id AND m.user_id=p_actor_id
       AND m.active=true AND m.role IN ('owner','admin','operator'))
   OR NOT EXISTS (
     SELECT 1 FROM altovena.tenant_memberships m
     WHERE m.tenant_id=p_tenant_id AND m.user_id=v_permit.reviewer_id
       AND m.active=true AND m.role IN ('owner','admin'))
 THEN RAISE EXCEPTION 'analysis_permit_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_preparation FROM altovena.mission_analysis_preparations a
 WHERE a.tenant_id=p_tenant_id AND a.mission_id=v_permit.mission_id;
 SELECT * INTO v_mission FROM altovena.missions m
 WHERE m.tenant_id=p_tenant_id AND m.id=v_permit.mission_id;
 IF v_preparation.state IS DISTINCT FROM 'prepared'
  OR v_preparation.prepared_by IS DISTINCT FROM p_actor_id
  OR v_preparation.routing_digest IS DISTINCT FROM v_permit.routing_digest
  OR v_mission.created_by IS DISTINCT FROM p_actor_id
  OR v_mission.state IS DISTINCT FROM 'draft'
  OR v_mission.product_slug IS DISTINCT FROM 'command'
  OR v_permit.goal_digest IS DISTINCT FROM
    encode(sha256(convert_to(btrim(v_mission.goal),'UTF8')),'hex')
 THEN RAISE EXCEPTION 'analysis_scope_or_digest_denied' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM altovena.analysis_reservations r
            WHERE r.permit_id=v_permit.id) THEN
   RETURN QUERY SELECT 'duplicate'::text, NULL::uuid;
   RETURN;
 END IF;
 IF v_budget.committed_cents + v_permit.reserved_cost_cents > v_budget.limit_cents THEN
   RAISE EXCEPTION 'analysis_monthly_budget_exhausted' USING ERRCODE='22023';
 END IF;
 INSERT INTO altovena.analysis_reservations(
   tenant_id,permit_id,actor_id,evidence_digest,period_start,committed_cents
 ) VALUES(p_tenant_id,p_permit_id,p_actor_id,p_evidence_digest,
          v_month,v_permit.reserved_cost_cents)
 RETURNING id INTO v_id;
 UPDATE altovena.analysis_budget_periods b
 SET committed_cents=b.committed_cents+v_permit.reserved_cost_cents
 WHERE b.tenant_id=p_tenant_id AND b.period_start=v_month;
 INSERT INTO altovena.analysis_budget_events(
   tenant_id,permit_id,reservation_id,event_type,payload
 ) VALUES(p_tenant_id,p_permit_id,v_id,'reserved',
    jsonb_build_object('maximum_cents',v_permit.reserved_cost_cents,
      'evidence_digest',p_evidence_digest));
 RETURN QUERY SELECT 'reserved'::text,v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION altovena.settle_analysis_budget(
 p_reservation_id uuid,p_state text,p_input_tokens integer,
 p_output_tokens integer,p_total_tokens integer,p_result_digest text
)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE v_row altovena.analysis_reservations%ROWTYPE;
        v_permit altovena.analysis_permits%ROWTYPE;
BEGIN
 IF p_reservation_id IS NULL OR p_state NOT IN ('completed','uncertain') THEN
  RAISE EXCEPTION 'analysis_settlement_invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_row FROM altovena.analysis_reservations r
 WHERE r.id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'analysis_reservation_missing' USING ERRCODE='22023'; END IF;
 IF v_row.state <> 'reserved' THEN
   IF v_row.state=p_state AND
     v_row.input_tokens IS NOT DISTINCT FROM p_input_tokens AND
     v_row.output_tokens IS NOT DISTINCT FROM p_output_tokens AND
     v_row.total_tokens IS NOT DISTINCT FROM p_total_tokens AND
     v_row.result_digest IS NOT DISTINCT FROM p_result_digest
   THEN RETURN 'already_settled'; END IF;
   RAISE EXCEPTION 'analysis_settlement_conflict' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_permit FROM altovena.analysis_permits p WHERE p.id=v_row.permit_id;
 IF p_state='completed' THEN
  IF p_input_tokens IS NULL OR p_output_tokens IS NULL OR p_total_tokens IS NULL
    OR p_input_tokens < 0 OR p_output_tokens < 0
    OR p_input_tokens > v_permit.max_input_tokens
    OR p_output_tokens > v_permit.max_output_tokens
    OR p_total_tokens <> p_input_tokens+p_output_tokens
    OR p_result_digest !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'analysis_usage_invalid' USING ERRCODE='22023'; END IF;
 ELSE
  IF p_input_tokens IS NOT NULL OR p_output_tokens IS NOT NULL
    OR p_total_tokens IS NOT NULL OR p_result_digest IS NOT NULL
  THEN RAISE EXCEPTION 'analysis_uncertain_must_hold_budget' USING ERRCODE='22023'; END IF;
 END IF;
 UPDATE altovena.analysis_reservations
 SET state=p_state,input_tokens=p_input_tokens,
  output_tokens=p_output_tokens,total_tokens=p_total_tokens,
  result_digest=p_result_digest,settled_at=clock_timestamp()
 WHERE id=p_reservation_id;
 INSERT INTO altovena.analysis_budget_events(
  tenant_id,permit_id,reservation_id,event_type,payload
 ) VALUES(v_row.tenant_id,v_row.permit_id,v_row.id,p_state,
   CASE WHEN p_state='completed'
   THEN jsonb_build_object('input_tokens',p_input_tokens,
     'output_tokens',p_output_tokens,'result_digest',p_result_digest)
   ELSE '{"status":"cost_pending_reconciliation"}'::jsonb END);
 -- Intentionally DO NOT release any previously committed monthly budget
 -- on either completed or uncertain: provider billing is independent.
 RETURN 'settled';
END;
$fn$;

CREATE OR REPLACE FUNCTION altovena.revoke_analysis_permit(
 p_permit_id uuid,p_reviewer_id uuid
)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE v_permit altovena.analysis_permits%ROWTYPE;v_reservation uuid;
BEGIN
 SELECT * INTO v_permit FROM altovena.analysis_permits p
 WHERE p.id=p_permit_id FOR UPDATE;
 IF NOT FOUND OR p_reviewer_id IS NULL OR v_permit.reviewer_id<>p_reviewer_id
  OR NOT EXISTS(SELECT 1 FROM altovena.tenant_memberships m
    WHERE m.tenant_id=v_permit.tenant_id AND m.user_id=p_reviewer_id
      AND m.active=true AND m.role IN ('owner','admin')) THEN
  RAISE EXCEPTION 'analysis_revocation_denied' USING ERRCODE='42501'; END IF;
 IF v_permit.state='revoked' THEN RETURN 'already_revoked'; END IF;
 UPDATE altovena.analysis_permits SET state='revoked' WHERE id=p_permit_id;
 SELECT id INTO v_reservation FROM altovena.analysis_reservations r
 WHERE r.permit_id=p_permit_id;
 IF v_reservation IS NOT NULL THEN
   INSERT INTO altovena.analysis_budget_events(
     tenant_id,permit_id,reservation_id,event_type,payload)
   VALUES(v_permit.tenant_id,p_permit_id,v_reservation,'permit_revoked',
     '{"note":"future_dispatch_must_recheck"}'::jsonb);
 END IF;
 RETURN 'revoked';
END;
$fn$;

-- Even when altovena is later in Data API exposed schemas, none of these
-- functions or tables are granted to anon/authenticated/service_role.
REVOKE ALL ON ALL TABLES IN SCHEMA altovena FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA altovena FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.reserve_analysis_budget(uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.settle_analysis_budget(uuid,text,integer,integer,integer,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.revoke_analysis_permit(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.reject_analysis_budget_event_mutation()
 FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE altovena.analysis_budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.analysis_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.analysis_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.analysis_budget_events ENABLE ROW LEVEL SECURITY;
COMMIT;
