-- RealtyFlow owner-only internal Altovena Command bridge v0.1.
-- Security boundary: these public RPCs are callable ONLY using a server-side
-- Supabase service_role credential. The Next.js route MUST independently
-- verify its signed RealtyFlow owner session before calling the RPC.
-- No client grants, no arbitrary tenant parameters, and no external actions.
BEGIN;

CREATE TABLE IF NOT EXISTS altovena.internal_mission_requests (
  tenant_id uuid NOT NULL REFERENCES altovena.tenants(id),
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  goal text NOT NULL CHECK (length(btrim(goal)) BETWEEN 1 AND 4000),
  mission_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,request_id),
  FOREIGN KEY (tenant_id,mission_id)
    REFERENCES altovena.missions (tenant_id,id)
);
ALTER TABLE altovena.internal_mission_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON altovena.internal_mission_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.altovena_internal_command_list(p_limit integer DEFAULT 30)
RETURNS TABLE (
  id uuid, goal text, state text, version integer,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_tenant uuid;
BEGIN
 IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
   RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023';
 END IF;
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
   AND t.status='active';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'internal_tenant_unavailable'; END IF;
 RETURN QUERY SELECT m.id,m.goal,m.state,m.version,m.created_at,m.updated_at
 FROM altovena.missions m JOIN altovena.tenant_products entitlement
 ON entitlement.tenant_id=m.tenant_id
 AND entitlement.product_slug=m.product_slug
 WHERE m.tenant_id=v_tenant AND m.product_slug='command'
   AND entitlement.status='active'
 ORDER BY m.updated_at DESC,m.id DESC LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.altovena_internal_command_create_draft(
 p_actor_email text,
 p_goal text,
 p_request_id uuid
)
RETURNS TABLE (
 id uuid, goal text, state text, version integer,
 created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
 v_tenant uuid;
 v_actor uuid;
 v_existing altovena.internal_mission_requests%ROWTYPE;
 v_created uuid;
BEGIN
 IF p_request_id IS NULL OR p_goal IS NULL OR
    length(btrim(p_goal)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'invalid_draft' USING ERRCODE='22023';
 END IF;
 IF p_actor_email IS NULL OR length(btrim(p_actor_email)) NOT BETWEEN 3 AND 320 THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE='22023';
 END IF;
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 JOIN altovena.tenant_products entitlement ON entitlement.tenant_id=t.id
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
   AND t.status='active'
   AND entitlement.product_slug='command'
   AND entitlement.status='active';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'internal_tenant_unavailable'; END IF;

 -- Email originates from a verified RealtyFlow owner session on the server.
 -- Never accept email from a public form as an authorization authority.
 SELECT u.id INTO v_actor FROM auth.users u
 WHERE lower(u.email)=lower(btrim(p_actor_email))
   AND u.email_confirmed_at IS NOT NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'verified_actor_not_found'; END IF;

 -- Reserve a request identifier. Concurrent duplicates serialize on the PK.
 INSERT INTO altovena.internal_mission_requests(
   tenant_id,request_id,actor_id,goal
 ) VALUES (v_tenant,p_request_id,v_actor,btrim(p_goal))
 ON CONFLICT (tenant_id,request_id) DO NOTHING;

 SELECT request.* INTO v_existing
 FROM altovena.internal_mission_requests request
 WHERE request.tenant_id=v_tenant AND request.request_id=p_request_id;

 IF v_existing.actor_id <> v_actor OR v_existing.goal <> btrim(p_goal) THEN
   RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023';
 END IF;

 IF v_existing.mission_id IS NULL THEN
   INSERT INTO altovena.missions(tenant_id,product_slug,created_by,goal,state)
   VALUES (v_tenant,'command',v_actor,btrim(p_goal),'draft')
   RETURNING missions.id INTO v_created;
   UPDATE altovena.internal_mission_requests request
   SET mission_id=v_created
   WHERE request.tenant_id=v_tenant AND request.request_id=p_request_id;
   INSERT INTO altovena.events(tenant_id,mission_id,event_type,payload)
   VALUES(v_tenant,v_created,'mission.draft_created',
     jsonb_build_object('actor_id',v_actor::text,'mode','manual_internal','request_id',p_request_id::text));
 ELSE
   v_created:=v_existing.mission_id;
 END IF;
 RETURN QUERY SELECT m.id,m.goal,m.state,m.version,m.created_at,m.updated_at
 FROM altovena.missions m WHERE m.tenant_id=v_tenant AND m.id=v_created;
END;
$$;

-- Service-role may execute only these narrow server RPC functions, not
-- directly query the altovena schema's rows via PostgREST.
REVOKE ALL ON FUNCTION public.altovena_internal_command_list(integer)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.altovena_internal_command_create_draft(text,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_list(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_create_draft(text,text,uuid) TO service_role;

COMMIT;
