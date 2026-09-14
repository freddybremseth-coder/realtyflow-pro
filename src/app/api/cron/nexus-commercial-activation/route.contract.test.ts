import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("src/app/api/cron/nexus-commercial-activation/route.ts", "utf8");

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
