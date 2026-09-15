import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("src/app/api/cron/nexus-commercial-activation/route.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260915071000_nexus_commercial_activation_runtime_boundary.sql",
  "utf8",
);

test("commercial activation is scheduler-authenticated, safe-mode governed and bounded", () => {
  assert.match(source, /requireNexusSchedulerApi\(request\)/);
  assert.match(source, /evaluateCronSafeMode\(PATH\)/);
  assert.match(source, /const MAX_PER_RUN = 10/);
  assert.match(source, /missing\.slice\(0, MAX_PER_RUN\)/);
});

test("commercial activation prioritizes VIEWING and QUALIFIED without using pipeline value as evidence", () => {
  assert.match(source, /\["VIEWING", "QUALIFIED"\]/);
  assert.match(source, /=== "VIEWING" \? 0 : 1/);
  assert.match(source, /buildBuyerProfileEvidencePreview/);
  assert.match(source, /decideBuyerProfileEvidenceDraft/);
  assert.match(source, /pipeline_value_used_as_criterion: false/);
});

test("commercial activation creates review-first drafts only", () => {
  assert.match(source, /status: "draft"/);
  assert.match(source, /purchaseReadiness: "unknown"/);
  assert.match(source, /approvedBy: null/);
  assert.match(source, /approvedAt: null/);
  assert.match(source, /Review Buyer Profile-utkast/);
  assert.match(source, /criteria_approval_status: "pending"/);
  assert.match(source, /auto_approved: false/);
});

test("insufficient or conflicting evidence becomes internal discovery work instead of inferred truth", () => {
  assert.match(source, /buyer_profile_evidence_conflict/);
  assert.match(source, /buyer_profile_discovery/);
  assert.match(source, /Kompletter Buyer Profile-grunnlag/);
  assert.match(source, /Avklar motstridende kjøperkriterier/);
});

test("commercial activation never sends to customers or advances the sales pipeline", () => {
  assert.match(source, /customer_send: false/);
  assert.match(source, /matching_triggered: false/);
  assert.match(source, /pipelineMutation: false/);
  assert.doesNotMatch(source, /sendEmail\(/);
  assert.doesNotMatch(source, /pipeline_status\s*:/);
});

test("restricted Lead Intelligence runtime never queries contacts or work_items directly", () => {
  assert.match(source, /nexus_commercial_activation_contact_guard/);
  assert.match(source, /ensure_nexus_commercial_activation_work_item/);
  assert.doesNotMatch(source, /from public\.contacts/i);
  assert.doesNotMatch(source, /insert into public\.work_items/i);
  assert.doesNotMatch(source, /from public\.work_items/i);
  assert.match(source, /runtime_boundary: "narrow_security_definer_v1"/);
});

test("runtime bridge is narrowly scoped, idempotent and keeps broad table grants closed", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /revoke all on function public\.nexus_commercial_activation_contact_guard/i);
  assert.match(migration, /grant execute on function public\.nexus_commercial_activation_contact_guard[\s\S]*realtyflow_lead_intelligence_runtime/i);
  assert.match(migration, /revoke all on function public\.ensure_nexus_commercial_activation_work_item/i);
  assert.match(migration, /grant execute on function public\.ensure_nexus_commercial_activation_work_item[\s\S]*realtyflow_lead_intelligence_runtime/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_source_id, 0\)\)/);
  assert.match(migration, /work_items_commercial_activation_source_unique/);
  assert.match(migration, /source_id like 'commercial-activation:%'/);
  assert.match(migration, /COMMERCIAL_ACTIVATION_STALE_CONTACT/);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)[\s\S]*public\.(contacts|work_items)/i);
});

test("failure telemetry is bounded to safe codes instead of raw database messages", () => {
  assert.match(source, /safeFailureCode/);
  assert.match(source, /failure_codes: failureCodes/);
  assert.match(source, /contactId: contact\.id,\s*code,/);
  assert.doesNotMatch(source, /error: error instanceof Error \? error\.message/);
});