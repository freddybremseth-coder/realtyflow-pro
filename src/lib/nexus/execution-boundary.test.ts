import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNexusExecutionBoundary,
  requireNexusExecutionBoundary,
} from "./execution-boundary";

const now = "2026-09-13T09:00:00.000Z";

function ready(overrides: Record<string, unknown> = {}) {
  return {
    executorEnabled: true,
    evidenceSatisfied: true,
    auditTrailReady: true,
    idempotencyKey: "sha256:operation-key",
    freshPreflight: { passed: true, checkedAt: now },
    now,
    ...overrides,
  } as Parameters<typeof evaluateNexusExecutionBoundary>[1];
}

test("unknown action types fail closed even with every execution signal", () => {
  const result = evaluateNexusExecutionBoundary("model_invented_external_send", ready());
  assert.equal(result.knownAction, false);
  assert.equal(result.automaticExecutionAllowed, false);
  assert.deepEqual(result.blockers, ["unknown_action"]);
});

test("every automatic side effect requires an audit trail and idempotency key", () => {
  const result = evaluateNexusExecutionBoundary("crm_inbound_reply_update", ready({
    auditTrailReady: false,
    idempotencyKey: "",
  }));
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.blockers.includes("audit_trail_required"), true);
  assert.equal(result.blockers.includes("idempotency_key_required"), true);
});

test("external actions require a passing and fresh preflight", () => {
  const stale = evaluateNexusExecutionBoundary("criteria_clarification_email", ready({
    freshPreflight: { passed: true, checkedAt: "2026-09-13T08:54:59.000Z" },
  }));
  assert.equal(stale.preflightFresh, false);
  assert.equal(stale.blockers.includes("fresh_safety_check_required"), true);

  const blocked = evaluateNexusExecutionBoundary("criteria_clarification_email", ready({
    freshPreflight: { passed: false, checkedAt: now },
  }));
  assert.equal(blocked.automaticExecutionAllowed, false);
});

test("preapproved recommendation and publishing paths still require explicit approval evidence", () => {
  for (const action of [
    "property_recommendation_send_preapproved",
    "social_publish_approved",
    "marketing_autopilot_publish_preapproved",
  ]) {
    const missing = evaluateNexusExecutionBoundary(action, ready());
    assert.equal(missing.blockers.includes("explicit_approval_required"), true);
    const approved = evaluateNexusExecutionBoundary(action, ready({ explicitApprovalSatisfied: true }));
    assert.equal(approved.automaticExecutionAllowed, true);
  }
});

test("future general lead follow-up remains draft-only", () => {
  const result = evaluateNexusExecutionBoundary("lead_follow_up_send", ready());
  assert.equal(result.policyClass, "DRAFT_ONLY");
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.blockers.includes("policy_class:draft_only"), true);
});

test("internal CRM and exact-evidence Buyer Profile updates pass only with their durable controls", () => {
  assert.equal(evaluateNexusExecutionBoundary("crm_inbound_reply_update", ready()).automaticExecutionAllowed, true);
  assert.equal(evaluateNexusExecutionBoundary("buyer_profile_exact_evidence_update", ready()).automaticExecutionAllowed, true);
});

test("require helper exposes a stable fail-closed error", () => {
  assert.throws(
    () => requireNexusExecutionBoundary("property_recommendation_send", ready()),
    /NEXUS_EXECUTION_BOUNDARY_BLOCKED:property_recommendation_send:policy_class:human_required/,
  );
});
