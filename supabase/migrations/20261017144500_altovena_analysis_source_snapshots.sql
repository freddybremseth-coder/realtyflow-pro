-- Development only. Private, immutable source evidence snapshots; NO live connector,
-- route, SaaS tenant grants, credential, provider call or production migration.
BEGIN;

CREATE TABLE altovena.analysis_source_bundles (
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  source_count smallint NOT NULL CHECK (source_count BETWEEN 1 AND 12),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,mission_id),
  FOREIGN KEY(tenant_id,mission_id) REFERENCES altovena.missions(tenant_id,id)
);
CREATE TABLE altovena.analysis_source_snapshots (
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  source_id text NOT NULL CHECK (source_id ~ '^[a-z0-9_-]{3,64}$'),
  source_ref text NOT NULL CHECK (source_ref ~ '^internal:[a-z0-9/_:.-]{3,200}$'),
  excerpt text NOT NULL CHECK (length(excerpt) BETWEEN 12 AND 4000
    AND position(chr(0) IN excerpt)=0),
  excerpt_digest text NOT NULL CHECK (excerpt_digest ~ '^[a-f0-9]{64}$'
    AND excerpt_digest=encode(sha256(convert_to(excerpt,'UTF8')),'hex')),
  captured_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,mission_id,source_id),
  UNIQUE(tenant_id,mission_id,source_ref),
  FOREIGN KEY(tenant_id,mission_id)
    REFERENCES altovena.analysis_source_bundles(tenant_id,mission_id)
);
CREATE OR REPLACE FUNCTION altovena.reject_analysis_source_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
BEGIN
 RAISE EXCEPTION 'analysis_source_snapshot_immutable' USING ERRCODE='22023';
END;
$body$;
CREATE TRIGGER altovena_analysis_source_bundles_immutable
 BEFORE UPDATE OR DELETE ON altovena.analysis_source_bundles
 FOR EACH ROW EXECUTE FUNCTION altovena.reject_analysis_source_mutation();
CREATE TRIGGER altovena_analysis_source_snapshots_immutable
 BEFORE UPDATE OR DELETE ON altovena.analysis_source_snapshots
 FOR EACH ROW EXECUTE FUNCTION altovena.reject_analysis_source_mutation();

-- This function's caller MUST be a trusted, future source-ingest database
-- worker that has individually authenticated each source against an external
-- private system. It does not trust web URLs or standalone model excerpts.
-- Current release grants EXECUTE to NOBODY outside the migration owner.
CREATE OR REPLACE FUNCTION altovena.save_analysis_source_bundle(
 p_tenant_id uuid,p_mission_id uuid,p_actor_id uuid,
 p_expected_digest text,p_sources jsonb
)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
DECLARE
 v_item jsonb;
 v_id text;v_ref text;v_excerpt text;v_hash text;
 v_time_str text;v_time timestamptz;
 v_count integer;v_bytes integer:=0;
 v_digest text;
BEGIN
 IF p_tenant_id IS NULL OR p_mission_id IS NULL OR p_actor_id IS NULL
 OR p_expected_digest IS NULL OR p_expected_digest !~ '^[a-f0-9]{64}$'
 OR p_sources IS NULL OR jsonb_typeof(p_sources)<>'array'
 THEN RAISE EXCEPTION 'analysis_capture_invalid' USING ERRCODE='22023'; END IF;
 v_count:=jsonb_array_length(p_sources);
 IF v_count NOT BETWEEN 1 AND 12
 OR NOT EXISTS(
  SELECT 1 FROM altovena.tenants t
  JOIN altovena.tenant_products p ON p.tenant_id=t.id
  WHERE t.id=p_tenant_id AND t.status='active' AND p.product_slug='command'
    AND p.status='active'
 )
 OR NOT EXISTS(
  SELECT 1 FROM altovena.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=p_actor_id
    AND m.active=true AND m.role IN ('owner','admin','operator')
 )
 OR NOT EXISTS(
  SELECT 1 FROM altovena.missions m
  JOIN altovena.mission_analysis_preparations a
    ON a.tenant_id=m.tenant_id AND a.mission_id=m.id
  WHERE m.tenant_id=p_tenant_id AND m.id=p_mission_id
    AND m.product_slug='command' AND m.state='draft'
    AND m.created_by=p_actor_id AND a.prepared_by=p_actor_id
    AND a.state='prepared'
 )
 THEN RAISE EXCEPTION 'analysis_capture_authorization_denied' USING ERRCODE='42501'; END IF;
 -- Exactly one immutable capture per mission, never silently overwrite.
 IF EXISTS(SELECT 1 FROM altovena.analysis_source_bundles b
   WHERE b.tenant_id=p_tenant_id AND b.mission_id=p_mission_id)
 THEN RAISE EXCEPTION 'analysis_bundle_already_captured' USING ERRCODE='22023';END IF;
 INSERT INTO altovena.analysis_source_bundles(
  tenant_id,mission_id,actor_id,evidence_digest,source_count)
 VALUES(p_tenant_id,p_mission_id,p_actor_id,p_expected_digest,v_count);
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_sources) AS src(value) LOOP
   IF jsonb_typeof(v_item)<>'object'
    OR (SELECT count(*) FROM jsonb_object_keys(v_item))<>5
    OR NOT (v_item ?& array['sourceId','sourceRef','excerpt','excerptDigest','capturedAt'])
   THEN RAISE EXCEPTION 'analysis_source_shape_invalid' USING ERRCODE='22023'; END IF;
   v_id:=v_item->>'sourceId';
   v_ref:=v_item->>'sourceRef';
   v_excerpt:=v_item->>'excerpt';
   v_hash:=v_item->>'excerptDigest';
   v_time_str:=v_item->>'capturedAt';
   IF v_id IS NULL OR v_id !~ '^[a-z0-9_-]{3,64}$'
    OR v_ref IS NULL OR v_ref !~ '^internal:[a-z0-9/_:.-]{3,200}$'
    OR v_excerpt IS NULL OR length(v_excerpt) NOT BETWEEN 12 AND 4000
    OR position(chr(0) IN v_excerpt)<>0
    OR v_hash IS NULL OR v_hash !~ '^[a-f0-9]{64}$'
    OR v_hash<>encode(sha256(convert_to(v_excerpt,'UTF8')),'hex')
    OR v_time_str IS NULL
    OR v_time_str !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
   THEN RAISE EXCEPTION 'analysis_source_content_invalid' USING ERRCODE='22023'; END IF;
   v_time:=v_time_str::timestamptz;
   IF v_time>clock_timestamp() OR v_time<clock_timestamp()-interval '15 minutes'
   THEN RAISE EXCEPTION 'analysis_source_stale' USING ERRCODE='22023'; END IF;
   v_bytes:=v_bytes+octet_length(v_excerpt);
   IF v_bytes>16000 THEN RAISE EXCEPTION 'analysis_source_bytes_exceeded' USING ERRCODE='22023';END IF;
   INSERT INTO altovena.analysis_source_snapshots(
     tenant_id,mission_id,source_id,source_ref,excerpt,excerpt_digest,captured_at)
   VALUES(p_tenant_id,p_mission_id,v_id,v_ref,v_excerpt,v_hash,v_time);
 END LOOP;
 SELECT encode(sha256(convert_to(
  'altovena-source-bundle-v1'||chr(10)||p_tenant_id::text||chr(10)
  ||p_mission_id::text||chr(10)
  ||string_agg(s.source_id||':'||s.excerpt_digest,chr(10)
    ORDER BY s.source_id COLLATE "C"),'UTF8')),'hex')
 INTO v_digest
 FROM altovena.analysis_source_snapshots s
 WHERE s.tenant_id=p_tenant_id AND s.mission_id=p_mission_id;
 IF v_digest IS DISTINCT FROM p_expected_digest
 THEN RAISE EXCEPTION 'analysis_bundle_digest_mismatch' USING ERRCODE='22023';END IF;
 RETURN v_digest;
END;
$body$;

-- Proof of a source bundle is *not yet* independent reviewer approval.
-- In a future release a verified reviewer, authenticated separately from
-- the capture worker, can seal the stored bundle for the existing permit gate.
CREATE OR REPLACE FUNCTION altovena.attest_saved_analysis_sources(
 p_tenant_id uuid,p_mission_id uuid,p_reviewer_id uuid,p_evidence_digest text
)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
DECLARE v_bundle altovena.analysis_source_bundles%ROWTYPE;
 v_permit altovena.analysis_permits%ROWTYPE;v_count integer;
BEGIN
 IF p_tenant_id IS NULL OR p_mission_id IS NULL OR p_reviewer_id IS NULL
 OR p_evidence_digest IS NULL OR p_evidence_digest !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'analysis_source_attestation_invalid' USING ERRCODE='22023';END IF;
 SELECT * INTO v_bundle FROM altovena.analysis_source_bundles b
  WHERE b.tenant_id=p_tenant_id AND b.mission_id=p_mission_id;
 SELECT * INTO v_permit FROM altovena.analysis_permits p
  WHERE p.tenant_id=p_tenant_id AND p.mission_id=p_mission_id FOR UPDATE;
 SELECT count(*) INTO v_count FROM altovena.analysis_source_snapshots s
  WHERE s.tenant_id=p_tenant_id AND s.mission_id=p_mission_id
   AND s.captured_at>=clock_timestamp()-interval '15 minutes'
   AND s.captured_at<=clock_timestamp();
 IF v_bundle.mission_id IS NULL OR v_permit.id IS NULL
 OR v_bundle.evidence_digest IS DISTINCT FROM p_evidence_digest
 OR v_permit.evidence_digest IS DISTINCT FROM p_evidence_digest
 OR v_bundle.actor_id IS DISTINCT FROM v_permit.actor_id
 OR v_bundle.source_count IS DISTINCT FROM v_count
 OR v_permit.reviewer_id IS DISTINCT FROM p_reviewer_id
 OR v_permit.actor_id=p_reviewer_id
 OR v_permit.state<>'pending'
 OR v_permit.expires_at<=clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM altovena.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=p_reviewer_id
      AND m.active AND m.role IN ('owner','admin'))
 THEN RAISE EXCEPTION 'analysis_source_attestation_denied' USING ERRCODE='42501';END IF;
 INSERT INTO altovena.analysis_evidence_attestations(
  tenant_id,mission_id,evidence_digest,verified_by,source_count,state,valid_until)
 VALUES(p_tenant_id,p_mission_id,p_evidence_digest,p_reviewer_id,
  v_count,'verified',clock_timestamp()+interval '5 minutes');
 RETURN 'attested_for_reviewer';
END;
$body$;

CREATE OR REPLACE FUNCTION altovena.require_stored_bundle_for_attestation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
BEGIN
 IF NEW.state='verified' AND NOT EXISTS(
  SELECT 1 FROM altovena.analysis_source_bundles b
  WHERE b.tenant_id=NEW.tenant_id AND b.mission_id=NEW.mission_id
  AND b.evidence_digest=NEW.evidence_digest
  AND b.source_count=NEW.source_count
  AND b.actor_id<>NEW.verified_by
  AND EXISTS(
    SELECT 1 FROM altovena.analysis_permits p
    WHERE p.tenant_id=b.tenant_id AND p.mission_id=b.mission_id
      AND p.reviewer_id=NEW.verified_by AND p.actor_id=b.actor_id)
 )
 THEN RAISE EXCEPTION 'source_attestation_missing_stored_bundle'
   USING ERRCODE='42501';END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER altovena_analysis_attestation_needs_source_bundle
BEFORE INSERT OR UPDATE ON altovena.analysis_evidence_attestations
FOR EACH ROW EXECUTE FUNCTION altovena.require_stored_bundle_for_attestation();

ALTER TABLE altovena.analysis_source_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.analysis_source_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON altovena.analysis_source_bundles,altovena.analysis_source_snapshots
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.reject_analysis_source_mutation()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.save_analysis_source_bundle(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.attest_saved_analysis_sources(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION altovena.require_stored_bundle_for_attestation()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
