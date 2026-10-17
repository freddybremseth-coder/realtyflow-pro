-- Read-only owner-visible diagnostics for Command analysis preparation.
-- No approval or execution endpoint is exposed. Development migration only.
BEGIN;
CREATE OR REPLACE FUNCTION public.altovena_internal_command_analysis_status(
 p_mission_id uuid,p_actor_email text
)
RETURNS TABLE(
 mission_id uuid,
 preparation_status text,
 source_status text,
 source_count integer,
 permit_status text,
 review_status text,
 execution_enabled boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_actor uuid;v_tenant uuid;v_mission uuid;
BEGIN
 IF p_mission_id IS NULL OR p_actor_email IS NULL OR
 length(btrim(p_actor_email)) NOT BETWEEN 3 AND 320
 THEN RAISE EXCEPTION 'analysis_status_invalid' USING ERRCODE='22023';END IF;
 SELECT u.id INTO v_actor FROM auth.users u
 WHERE lower(u.email)=lower(btrim(p_actor_email))
  AND u.email_confirmed_at IS NOT NULL;
 SELECT t.id INTO v_tenant FROM altovena.tenants t
 JOIN altovena.tenant_products p ON p.tenant_id=t.id
 WHERE t.external_ref='host:realtyflowpro:altovena-internal'
  AND t.status='active' AND p.product_slug='command' AND p.status='active';
 SELECT m.id INTO v_mission FROM altovena.missions m
 WHERE m.id=p_mission_id AND m.tenant_id=v_tenant
  AND m.created_by=v_actor AND m.product_slug='command';
 IF v_actor IS NULL OR v_tenant IS NULL OR v_mission IS NULL
 THEN RAISE EXCEPTION 'analysis_status_not_authorized' USING ERRCODE='42501';END IF;
 RETURN QUERY
 SELECT m.id,
   COALESCE(a.state,'not_prepared')::text,
   CASE
    WHEN b.mission_id IS NULL THEN 'no_stored_sources'
    WHEN e.state='verified' AND e.valid_until>clock_timestamp()
      THEN 'independently_attested'
    WHEN e.state='revoked' OR (e.state='verified' AND e.valid_until<=clock_timestamp())
      THEN 'attestation_inactive'
    ELSE 'stored_awaiting_source_review'
   END::text,
   COALESCE(b.source_count,0)::integer,
   COALESCE(p.state,'not_requested')::text,
   COALESCE((
     SELECT ev.event_type
     FROM altovena.analysis_permit_review_events ev
     WHERE ev.tenant_id=v_tenant AND ev.permit_id=p.id
     ORDER BY ev.id DESC LIMIT 1
   ),'no_decision')::text,
   false::boolean
 FROM altovena.missions m
 LEFT JOIN altovena.mission_analysis_preparations a
  ON a.tenant_id=m.tenant_id AND a.mission_id=m.id
 LEFT JOIN altovena.analysis_source_bundles b
  ON b.tenant_id=m.tenant_id AND b.mission_id=m.id
 LEFT JOIN altovena.analysis_permits p
  ON p.tenant_id=m.tenant_id AND p.mission_id=m.id
 LEFT JOIN altovena.analysis_evidence_attestations e
  ON e.tenant_id=m.tenant_id AND e.mission_id=m.id
   AND e.evidence_digest=b.evidence_digest
 WHERE m.tenant_id=v_tenant AND m.id=v_mission;
END;
$body$;
REVOKE ALL ON FUNCTION public.altovena_internal_command_analysis_status(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.altovena_internal_command_analysis_status(uuid,text)
 TO service_role;
COMMIT;
