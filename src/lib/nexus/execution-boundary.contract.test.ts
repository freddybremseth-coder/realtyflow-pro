import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("customer email execution paths enforce the central boundary before providers", () => {
  const recommendation = source("../../services/email/property-recommendation-send.ts");
  const criteria = source("../../services/email/buyer-profile-confirmation.ts");
  assert.match(recommendation, /evaluateNexusExecutionBoundary\("property_recommendation_send_preapproved"/);
  assert.ok(recommendation.indexOf("evaluateNexusExecutionBoundary") < recommendation.indexOf("await sendBrandEmail"));
  assert.match(criteria, /evaluateNexusExecutionBoundary\("criteria_clarification_email"/);
  assert.ok(criteria.lastIndexOf("evaluateNexusExecutionBoundary") < criteria.indexOf("const sent = await sendBrandEmail"));
  assert.match(criteria, /confirmation_execution_idempotency_key/);
  assert.match(criteria, /confirmation_execution_audit/);
});

test("internal CRM and Buyer Profile mutations enforce policy, audit and idempotency", () => {
  const crm = source("../../services/email/apply-inbound-crm-actions.ts");
  const profile = source("../../services/email/inbound-buyer-profile-revision.ts");
  assert.match(crm, /requireNexusExecutionBoundary\("crm_inbound_reply_update"/);
  assert.match(crm, /idempotencyKey: interactionId/);
  assert.ok(crm.indexOf("requireNexusExecutionBoundary") < crm.indexOf('from("contacts").update(update)'));
  assert.match(profile, /evaluateNexusExecutionBoundary\("buyer_profile_exact_evidence_update"/);
  assert.match(profile, /idempotencyKey: revisionActor/);
  assert.ok(profile.indexOf("evaluateNexusExecutionBoundary") < profile.indexOf("return withLeadIntelligenceTransaction"));
});

test("approved social publishing and live marketing autopilot share the same fail-closed boundary", () => {
  const approved = source("../../services/marketing/publish-executor.ts");
  const autopilot = source("../../services/marketing/autonomous-orchestrator.ts");
  assert.match(approved, /requireNexusExecutionBoundary\("social_publish_approved"/);
  assert.ok(approved.indexOf("requireNexusExecutionBoundary") < approved.indexOf("const res = await cfg.publisher.publish"));
  assert.match(autopilot, /evaluateNexusExecutionBoundary\("marketing_autopilot_publish_preapproved"/);
  assert.match(autopilot, /explicitApprovalSatisfied: args\.preapprovedFormat === true/);
  assert.ok(autopilot.indexOf("evaluateNexusExecutionBoundary") < autopilot.indexOf("const res = await deps.publisher.publish"));
});

test("future general lead follow-up cannot silently inherit automatic send permission", () => {
  const registry = source("./action-policy-registry.ts");
  assert.match(registry, /lead_follow_up_send: \{[^\n]+policyClass: "DRAFT_ONLY"/);
});
