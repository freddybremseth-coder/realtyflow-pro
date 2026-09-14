import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "src/app/api/nexus/revenue-command/missions/prepare/real-estate-matching/route.ts",
  "utf8",
);
const preparer = readFileSync("src/lib/nexus-real-estate-matching-preparer.ts", "utf8");
const missionCron = readFileSync("src/app/api/cron/nexus-mission-autopilot/route.ts", "utf8");
const propertyMatchWorker = readFileSync("src/app/api/cron/nexus-property-match-prep/route.ts", "utf8");
const buyerProfileWorker = readFileSync("src/app/api/cron/nexus-buyer-profile-sync/route.ts", "utf8");

test("matching mission requires a current approved Buyer Profile and health gate", () => {
  assert.match(source, /\.eq\("status", "approved"\)/);
  assert.match(source, /buildRealEstateMatchingPreparation/);
  assert.match(source, /if \(!prepared\.ready\)/);
  assert.match(preparer, /health\.status !== "BLOCKED"/);
  assert.match(preparer, /buyer_profile_status: "APPROVED"/);
});

test("matching mission seeds the existing CRM property-match chain instead of inventing a parallel executor", () => {
  assert.match(source, /source_type: "crm"/);
  assert.match(source, /assigned_agent: "nexus_property_match_autopilot"/);
  assert.match(preparer, /classification: "property_interest"/);
  assert.match(preparer, /buyer_profile_sync_at: now\.toISOString\(\)/);
  assert.match(preparer, /property_match_prepared_at: null/);
  assert.match(propertyMatchWorker, /source_type", "crm"/);
  assert.match(propertyMatchWorker, /property_match_prepared_at/);
  assert.match(buyerProfileWorker, /if \(metadata\.buyer_profile_sync_at\) continue/);
});

test("Mission Autopilot routes match actions to the dedicated internal preparer", () => {
  assert.match(missionCron, /prepare_real_estate_matching: "\/api\/nexus\/revenue-command\/missions\/prepare\/real-estate-matching"/);
  assert.match(source, /canPrepareRealEstateMatchingMission/);
});

test("matching preparation cannot send, mutate Buyer Profile or move pipeline", () => {
  assert.doesNotMatch(source, /sendBrandEmail|sendEmail\(|executeApproval|request_approval/);
  assert.doesNotMatch(source, /from\("buyer_profiles"\)\s*\.update/);
  assert.doesNotMatch(source, /pipeline_status\s*:/);
  assert.match(preparer, /external_action_executed: false/);
  assert.match(preparer, /customer_send: false/);
  assert.match(source, /reviewRequiredBeforeCustomerSend: true/);
});

test("matching work item is idempotent per mission and approved profile version", () => {
  assert.match(preparer, /nexus-matching:\$\{mission\.id\}:\$\{buyerProfile\.id\}:v\$\{version\}/);
  assert.match(source, /\.eq\("source_id", prepared\.sourceId\)/);
  assert.match(source, /preparedMatchingArtifact/);
});
