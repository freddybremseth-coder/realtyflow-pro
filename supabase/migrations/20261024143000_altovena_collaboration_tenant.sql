-- Isolated Altovena collaboration workspace for Freddy and Andrea.
-- Does not expose the existing owner-only Altovena Internal tenant or any finance/CRM data.
BEGIN;

INSERT INTO altovena.tenants(name,external_ref,status)
VALUES ('Altovena Collaboration','host:realtyflowpro:altovena-collaboration','active')
ON CONFLICT (external_ref) DO NOTHING;

INSERT INTO altovena.tenant_products(tenant_id,product_slug,status,activated_at)
SELECT id,'command','active',now()
FROM altovena.tenants
WHERE external_ref='host:realtyflowpro:altovena-collaboration' AND status='active'
ON CONFLICT (tenant_id,product_slug) DO NOTHING;

-- Register only Andrea's independently verified RealtyFlow Auth identity.
INSERT INTO altovena.tenant_memberships(tenant_id,user_id,role,active)
SELECT tenant.id,identity.user_id,'operator',true
FROM altovena.tenants tenant
JOIN core.workspace_user_directory identity ON lower(identity.username)='andrea'
JOIN auth.users verified ON verified.id=identity.user_id
WHERE tenant.external_ref='host:realtyflowpro:altovena-collaboration'
  AND identity.status='active'
  AND verified.email_confirmed_at IS NOT NULL
  AND lower(verified.email)=lower(identity.email)
ON CONFLICT (tenant_id,user_id) DO UPDATE SET role='operator',active=true;

CREATE OR REPLACE FUNCTION public.altovena_collaboration_is_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog
AS $$
 SELECT EXISTS(
   SELECT 1 FROM altovena.tenant_memberships membership
   JOIN altovena.tenants tenant ON tenant.id=membership.tenant_id
   WHERE tenant.external_ref='host:realtyflowpro:altovena-collaboration'
     AND tenant.status='active'
     AND membership.user_id=p_user_id
     AND membership.active=true
     AND membership.role IN ('owner','admin','operator','viewer')
 );
$$;

CREATE OR REPLACE FUNCTION public.altovena_collaboration_command_list(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,goal text,state text,version integer,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_tenant uuid;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023';
 END IF;
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 WHERE t.external_ref='host:realtyflowpro:altovena-collaboration' AND t.status='active';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'collaboration_tenant_unavailable'; END IF;
 RETURN QUERY SELECT m.id,m.goal,m.state,m.version,m.created_at,m.updated_at
 FROM altovena.missions m
 JOIN altovena.tenant_products entitlement
   ON entitlement.tenant_id=m.tenant_id AND entitlement.product_slug=m.product_slug
 WHERE m.tenant_id=v_tenant AND m.product_slug='command'
   AND entitlement.status='active'
 ORDER BY m.updated_at DESC,m.id DESC
 LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.altovena_collaboration_command_create_draft(
 p_actor_email text,p_goal text,p_request_id uuid,p_verified_owner boolean DEFAULT false
)
RETURNS TABLE(id uuid,goal text,state text,version integer,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
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
 JOIN altovena.tenant_products e ON e.tenant_id=t.id
 WHERE t.external_ref='host:realtyflowpro:altovena-collaboration'
   AND t.status='active' AND e.product_slug='command' AND e.status='active';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'collaboration_tenant_unavailable'; END IF;
 SELECT u.id INTO v_actor FROM auth.users u
 WHERE lower(u.email)=lower(btrim(p_actor_email))
   AND u.email_confirmed_at IS NOT NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'verified_actor_not_found'; END IF;
 -- Every non-owner must remain an active, named member of this isolated tenant.
 IF NOT coalesce(p_verified_owner,false) AND NOT EXISTS(
   SELECT 1 FROM altovena.tenant_memberships member
   WHERE member.tenant_id=v_tenant AND member.user_id=v_actor
     AND member.active=true AND member.role IN ('owner','admin','operator')
 ) THEN
   RAISE EXCEPTION 'collaboration_membership_required' USING ERRCODE='42501';
 END IF;
 INSERT INTO altovena.internal_mission_requests(tenant_id,request_id,actor_id,goal)
 VALUES(v_tenant,p_request_id,v_actor,btrim(p_goal))
 ON CONFLICT (tenant_id,request_id) DO NOTHING;
 SELECT request.* INTO v_existing FROM altovena.internal_mission_requests request
 WHERE request.tenant_id=v_tenant AND request.request_id=p_request_id;
 IF v_existing.actor_id <> v_actor OR v_existing.goal <> btrim(p_goal) THEN
   RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023';
 END IF;
 IF v_existing.mission_id IS NULL THEN
   INSERT INTO altovena.missions(tenant_id,product_slug,created_by,goal,state)
   VALUES(v_tenant,'command',v_actor,btrim(p_goal),'draft')
   RETURNING missions.id INTO v_created;
   UPDATE altovena.internal_mission_requests request SET mission_id=v_created
   WHERE request.tenant_id=v_tenant AND request.request_id=p_request_id;
   INSERT INTO altovena.events(tenant_id,mission_id,event_type,payload)
   VALUES(v_tenant,v_created,'mission.draft_created',
     jsonb_build_object('actor_id',v_actor::text,'mode','collaboration_draft','request_id',p_request_id::text));
 ELSE
   v_created:=v_existing.mission_id;
 END IF;
 RETURN QUERY SELECT m.id,m.goal,m.state,m.version,m.created_at,m.updated_at
 FROM altovena.missions m WHERE m.tenant_id=v_tenant AND m.id=v_created;
END;
$$;

-- Privileged RPCs are callable only through the verified server-side route.
REVOKE ALL ON FUNCTION public.altovena_collaboration_is_member(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.altovena_collaboration_command_list(integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.altovena_collaboration_command_create_draft(text,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.altovena_collaboration_is_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.altovena_collaboration_command_list(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.altovena_collaboration_command_create_draft(text,text,uuid,boolean) TO service_role;
COMMIT;
