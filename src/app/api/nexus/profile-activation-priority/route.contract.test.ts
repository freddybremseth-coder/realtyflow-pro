import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(process.cwd(), "src/app/api/nexus/profile-activation-priority/route.ts"), "utf8");

test("profile activation priority reuses governed persona scoring", () => {
  assert.match(source, /prioritizePersonaBackfill/);
  assert.match(source, /DIRECT_APPROVAL_CONFIDENCE = 80/);
  assert.match(source, /READY_TO_APPROVE/);
  assert.match(source, /REVIEW_REQUIRED/);
  assert.match(source, /DISCOVERY_REQUIRED/);
});

test("profile activation priority projects explicit CRM evidence through Customer 360 completeness", () => {
  assert.match(source, /buildBuyerProfileEvidencePreview/);
  assert.match(source, /evidencePreview\.currentCompleteness/);
  assert.match(source, /evidencePreview\.projectedCompleteness/);
  assert.match(source, /wouldMeetAutoGateIfEvidenceApproved/);
  assert.match(source, /executorEligible: false/);
  assert.match(source, /projectedEvidenceExecutorEligible: false/);
  assert.match(source, /profileAutoEligible:/);
  assert.match(source, /projectedProfileComplete:/);
  assert.match(source, /autoActivationConfidence: 95/);
});

test("profile activation priority ranks one read-only discovery action per incomplete profile", () => {
  assert.match(source, /buildBuyerProfileDiscoveryPriority/);
  assert.match(source, /projectedCompletenessScore/);
  assert.match(source, /projectedMissing/);
  assert.match(source, /evidenceConflictCount/);
  assert.match(source, /b\.discovery\.score - a\.discovery\.score/);
  assert.match(source, /discoveryNeeded:/);
  assert.match(source, /discoveryCritical:/);
  assert.match(source, /discoveryHigh:/);
  assert.match(source, /discoveryPriorityOnly: true/);
});

test("profile activation priority remains read-only", () => {
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /sendEmail|sendBrandEmail/);
  assert.match(source, /readOnly: true/);
  assert.match(source, /evidencePreviewOnly: true/);
  assert.match(source, /discoveryPriorityOnly: true/);
  assert.match(source, /buyerProfileWritten: false/);
});
