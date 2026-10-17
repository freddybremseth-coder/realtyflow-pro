\set ON_ERROR_STOP on
-- Run ONLY against ephemeral CI PostgreSQL after all Altovena fixtures.

DO $$
DECLARE v_tenant uuid;v_mission uuid;v_owner uuid;
        v_review uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
BEGIN
 SELECT id INTO v_tenant FROM altovena.tenants
 WHERE external_ref='host:realtyflowpro:altovena-internal';
 SELECT id INTO v_mission FROM altovena.missions WHERE tenant_id=v_tenant LIMIT 1;
 SELECT created_by INTO v_owner FROM altovena.missions WHERE id=v_mission;
 INSERT INTO auth.users(id,email,email_confirmed_at)
 VALUES(v_review,'independent-reviewer@example.test',now());
 INSERT INTO altovena.tenant_memberships(tenant_id,user_id,role,active)
 VALUES(v_tenant,v_owner,'operator',true),
       (v_tenant,v_review,'owner',true);
 INSERT INTO altovena.analysis_budget_periods(tenant_id,period_start,limit_cents)
 VALUES(v_tenant,date_trunc('month',now() AT TIME ZONE 'UTC')::date,10);
 INSERT INTO altovena.analysis_permits(
  tenant_id,mission_id,actor_id,reviewer_id,approved_at,state,model,
  goal_digest,routing_digest,evidence_digest,max_input_tokens,
  max_output_tokens,reserved_cost_cents,expires_at
 ) SELECT v_tenant,v_mission,v_owner,v_review,clock_timestamp(),
   'approved_for_read_only_analysis','gpt-5.6',
   encode(sha256(convert_to(btrim(m.goal),'UTF8')),'hex'),
   a.routing_digest,repeat('a',64),1200,650,12,clock_timestamp()+interval '8 minutes'
 FROM altovena.missions m
 JOIN altovena.mission_analysis_preparations a
  ON a.tenant_id=m.tenant_id AND a.mission_id=m.id
 WHERE m.id=v_mission;
END $$;

DO $$
DECLARE v_tenant uuid;v_actor uuid;v_permit uuid;v_receipt uuid;
        v_row record;v_err boolean;v_count bigint;
BEGIN
 SELECT tenant_id,actor_id,id INTO v_tenant,v_actor,v_permit
 FROM altovena.analysis_permits LIMIT 1;
 IF has_table_privilege('anon','altovena.analysis_permits','SELECT')
 OR has_table_privilege('authenticated','altovena.analysis_reservations','INSERT')
 OR has_table_privilege('service_role','altovena.analysis_budget_events','SELECT')
 OR has_function_privilege('service_role',
   'altovena.reserve_analysis_budget(uuid,uuid,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'analysis budget grant was broadened'; END IF;
 v_err:=false;
 BEGIN
  PERFORM * FROM altovena.reserve_analysis_budget(
   v_permit,v_tenant,v_actor,repeat('a',64));
 EXCEPTION WHEN invalid_parameter_value THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'over budget reservation succeeded'; END IF;
 UPDATE altovena.analysis_budget_periods SET limit_cents=25 WHERE tenant_id=v_tenant;
 v_err:=false;
 BEGIN
  PERFORM * FROM altovena.reserve_analysis_budget(
   v_permit,v_tenant,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',repeat('a',64));
 EXCEPTION WHEN insufficient_privilege THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'foreign actor reserved permit'; END IF;
 v_err:=false;
 BEGIN
  PERFORM * FROM altovena.reserve_analysis_budget(
   v_permit,v_tenant,v_actor,repeat('f',64));
 EXCEPTION WHEN insufficient_privilege THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'wrong evidence digest admitted'; END IF;
 UPDATE altovena.tenant_memberships SET active=false
 WHERE tenant_id=v_tenant AND user_id=v_actor;
 v_err:=false;
 BEGIN
  PERFORM * FROM altovena.reserve_analysis_budget(
   v_permit,v_tenant,v_actor,repeat('a',64));
 EXCEPTION WHEN insufficient_privilege THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'revoked actor membership admitted'; END IF;
 UPDATE altovena.tenant_memberships SET active=true
 WHERE tenant_id=v_tenant AND user_id=v_actor;
 SELECT * INTO v_row FROM altovena.reserve_analysis_budget(
   v_permit,v_tenant,v_actor,repeat('a',64));
 IF v_row.result_kind <> 'reserved' OR v_row.result_reservation_id IS NULL
 THEN RAISE EXCEPTION 'valid permit was not reserved'; END IF;
 v_receipt:=v_row.result_reservation_id;
 SELECT * INTO v_row FROM altovena.reserve_analysis_budget(
   v_permit,v_tenant,v_actor,repeat('a',64));
 IF v_row.result_kind <> 'duplicate' OR v_row.result_reservation_id IS NOT NULL
 THEN RAISE EXCEPTION 'duplicate attempted reservation'; END IF;
 SELECT committed_cents INTO v_count FROM altovena.analysis_budget_periods
 WHERE tenant_id=v_tenant;
 IF v_count<>12 THEN RAISE EXCEPTION 'cost reservation accounting must be exactly once'; END IF;
 SELECT count(*) INTO v_count FROM altovena.analysis_budget_events
 WHERE event_type='reserved';
 IF v_count<>1 THEN RAISE EXCEPTION 'duplicate budget audit event'; END IF;
 v_err:=false;
 BEGIN
  PERFORM altovena.settle_analysis_budget(
   v_receipt,'completed',1201,1,1202,repeat('b',64));
 EXCEPTION WHEN invalid_parameter_value THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'provider overrun accepted'; END IF;
 IF altovena.settle_analysis_budget(
    v_receipt,'completed',300,200,500,repeat('b',64)) <> 'settled'
 THEN RAISE EXCEPTION 'valid settlement failed'; END IF;
 IF altovena.settle_analysis_budget(
    v_receipt,'completed',300,200,500,repeat('b',64)) <> 'already_settled'
 THEN RAISE EXCEPTION 'repeated settlement not idempotent'; END IF;
 v_err:=false;
 BEGIN
  PERFORM altovena.settle_analysis_budget(
   v_receipt,'uncertain',NULL,NULL,NULL,NULL);
 EXCEPTION WHEN invalid_parameter_value THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'settlement replay modified state'; END IF;
 SELECT committed_cents INTO v_count FROM altovena.analysis_budget_periods
 WHERE tenant_id=v_tenant;
 IF v_count<>12 THEN RAISE EXCEPTION 'settlement incorrectly released reserved upper bound'; END IF;
 SELECT count(*) INTO v_count FROM altovena.analysis_budget_events;
 IF v_count<>2 THEN RAISE EXCEPTION 'budget event count mismatch'; END IF;
 v_err:=false;
 BEGIN
  UPDATE altovena.analysis_budget_events SET event_type='reserved';
 EXCEPTION WHEN invalid_parameter_value THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'budget audit events mutated'; END IF;
 IF altovena.revoke_analysis_permit(
    v_permit,'dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 'revoked'
 THEN RAISE EXCEPTION 'permit reviewer revocation failed'; END IF;
 v_err:=false;
 BEGIN
  PERFORM * FROM altovena.reserve_analysis_budget(
   v_permit,v_tenant,v_actor,repeat('a',64));
 EXCEPTION WHEN insufficient_privilege THEN v_err:=true; END;
 IF NOT v_err THEN RAISE EXCEPTION 'revoked permit reopened'; END IF;
 SELECT count(*) INTO v_count FROM altovena.tasks;
 IF v_count<>0 THEN RAISE EXCEPTION 'budget ledger ran Altovena tasks'; END IF;
 SELECT count(*) INTO v_count FROM core.nexus_execution_tasks;
 IF v_count<>0 THEN RAISE EXCEPTION 'budget ledger activated Nexus'; END IF;
END $$;
SELECT 'Altovena private budget ledger: deny, reserve once, settle once, revoke, immutable audit PASS' AS result;
