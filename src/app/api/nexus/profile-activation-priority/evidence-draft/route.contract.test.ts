import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(process.cwd(), "src/app/api/nexus/profile-activation-priority/evidence-draft/route.ts"), "utf8");

test("evidence draft route is multi-brand and transactionally revalidates the contact", () => {
  assert.match(source, /brand: LeadIntelligenceRealEstateBrandSchema/);
  assert.match(source, /withLeadIntelligenceTransaction\(parsed\.data\.brand/);
  assert.match(source, /brand !== parsed\.data\.brand/);
  assert.match(source, /for update/);
  assert.match(source, /ACTIVE_STAGES/);
  assert.match(source, /do_not_contact/);
  assert.match(source, /email_suppressed/);
});

test("evidence draft route rebuilds evidence and blocks conflicts or approved profiles", () => {
  assert.match(source, /buildBuyerProfileEvidencePreview/);
  assert.match(source, /decideBuyerProfileEvidenceDraft/);
  assert.match(source, /status in \('approved', 'draft'\)/);
  assert.match(source, /An approved Buyer Profile already exists/);
  assert.match(source, /existing\?\.status === "draft"/);
});

test("evidence persistence remains draft and pending with no downstream execution", () => {
  assert.match(source, /status: "draft"/);
  assert.match(source, /criteria: decision\.criteria/);
  assert.match(source, /approvedBy: null/);
  assert.match(source, /approvedAt: null/);
  assert.match(source, /criteriaApprovalStatus: "pending"/);
  assert.match(source, /buyerProfileApproved: false/);
  assert.match(source, /matchingTriggered: false/);
  assert.match(source, /crmUpdated: false/);
  assert.match(source, /pipelineUpdated: false/);
  assert.match(source, /emailSent: false/);
  assert.match(source, /externalActionExecuted: false/);
});
