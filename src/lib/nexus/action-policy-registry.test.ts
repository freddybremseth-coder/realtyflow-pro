import assert from "node:assert/strict";
import test from "node:test";
import { canExecuteAutomatically, evaluateNexusActionPolicy, getNexusActionPolicy, listNexusActionPolicies, policyForRevenueAction } from "./action-policy-registry";

test("only explicitly safe actions may execute automatically", () => {
  const safe = ["crm_note_update","crm_inbound_reply_update","buyer_profile_exact_evidence_update","property_match_prepare","shortlist_draft_prepare","presentation_draft_prepare","criteria_clarification_email","property_recommendation_send_preapproved","social_publish_approved","marketing_autopilot_publish_preapproved"] as const;
  for (const actionType of safe) {
    const policy = getNexusActionPolicy(actionType);
    assert.equal(policy.policyClass, "AUTO_SAFE");
    assert.equal(canExecuteAutomatically(policy), true);
  }
  for (const policy of listNexusActionPolicies().filter((item) => !safe.includes(item.actionType as (typeof safe)[number]))) assert.equal(canExecuteAutomatically(policy), false);
});

test("runtime action evaluation fails closed for unknown action strings", () => {
  const result = evaluateNexusActionPolicy("model_invented_send", {
    executorEnabled: true,
    evidenceSatisfied: true,
    freshSafetyCheckPassed: true,
  });
  assert.equal(result.knownAction, false);
  assert.equal(result.policyClass, "FORBIDDEN");
  assert.equal(result.automaticExecutionAllowed, false);
  assert.deepEqual(result.blockers, ["unknown_action"]);
});

test("AUTO_SAFE is necessary but not sufficient for runtime execution", () => {
  const internal = evaluateNexusActionPolicy("property_match_prepare", {
    executorEnabled: true,
    evidenceSatisfied: true,
  });
  assert.equal(internal.automaticExecutionAllowed, true);

  const disabled = evaluateNexusActionPolicy("property_match_prepare", {
    executorEnabled: false,
    evidenceSatisfied: true,
  });
  assert.equal(disabled.automaticExecutionAllowed, false);
  assert.equal(disabled.blockers.includes("executor_disabled"), true);

  const missingEvidence = evaluateNexusActionPolicy("property_match_prepare", {
    executorEnabled: true,
    evidenceSatisfied: false,
  });
  assert.equal(missingEvidence.automaticExecutionAllowed, false);
  assert.equal(missingEvidence.blockers.includes("evidence_not_satisfied"), true);
});

test("customer-facing AUTO_SAFE actions require a fresh safety check", () => {
  const withoutCheck = evaluateNexusActionPolicy("property_recommendation_send_preapproved", {
    executorEnabled: true,
    evidenceSatisfied: true,
  });
  assert.equal(withoutCheck.automaticExecutionAllowed, false);
  assert.equal(withoutCheck.blockers.includes("fresh_safety_check_required"), true);

  const checked = evaluateNexusActionPolicy("property_recommendation_send_preapproved", {
    executorEnabled: true,
    evidenceSatisfied: true,
    freshSafetyCheckPassed: true,
  });
  assert.equal(checked.automaticExecutionAllowed, true);
});

test("generic customer-facing sends and commitments fail closed", () => {
  assert.equal(getNexusActionPolicy("general_customer_message").policyClass, "DRAFT_ONLY");
  assert.equal(getNexusActionPolicy("property_recommendation_send").policyClass, "HUMAN_REQUIRED");
  assert.equal(getNexusActionPolicy("viewing_booking").policyClass, "HUMAN_REQUIRED");
  assert.equal(getNexusActionPolicy("legal_or_contract_commitment").policyClass, "FORBIDDEN");
  assert.equal(getNexusActionPolicy("price_or_availability_guarantee").policyClass, "FORBIDDEN");
  assert.equal(evaluateNexusActionPolicy("general_customer_message", { executorEnabled: true, evidenceSatisfied: true, freshSafetyCheckPassed: true }).automaticExecutionAllowed, false);
});

test("preapproved matched-property send is narrowly auto-safe and requires fresh checks", () => {
  const policy = getNexusActionPolicy("property_recommendation_send_preapproved");
  assert.equal(policy.policyClass, "AUTO_SAFE");
  assert.equal(policy.customerFacing, true);
  assert.equal(policy.sideEffect, true);
  assert.equal(policy.requiresFreshSafetyCheck, true);
  assert.match(policy.reason, /final presentation approval/i);
  assert.match(policy.reason, /exactly-once/i);
});

test("ambiguous buyer criteria always require human interpretation", () => {
  const policy = getNexusActionPolicy("ambiguous_criteria_change");
  assert.equal(policy.policyClass, "HUMAN_REQUIRED");
  assert.equal(policy.customerFacing, false);
  assert.equal(policy.sideEffect, true);
});

test("narrow criteria clarification email remains gated by fresh safety checks", () => {
  const policy = getNexusActionPolicy("criteria_clarification_email");
  assert.equal(policy.policyClass, "AUTO_SAFE");
  assert.equal(policy.customerFacing, true);
  assert.equal(policy.requiresFreshSafetyCheck, true);
});

test("Revenue Brain source mapping is deterministic and never inferred from model confidence", () => {
  assert.equal(policyForRevenueAction({ source: "closing" }).policyClass, "HUMAN_REQUIRED");
  assert.equal(policyForRevenueAction({ source: "commissions" }).policyClass, "HUMAN_REQUIRED");
  assert.equal(policyForRevenueAction({ source: "approvals" }).policyClass, "HUMAN_REQUIRED");
  assert.equal(policyForRevenueAction({ source: "today" }).policyClass, "DRAFT_ONLY");
  assert.equal(policyForRevenueAction({ source: "recovery" }).policyClass, "DRAFT_ONLY");
  assert.equal(policyForRevenueAction({ source: "service-revenue" }).policyClass, "DRAFT_ONLY");
  assert.equal(policyForRevenueAction({ source: "after-sales" }).policyClass, "DRAFT_ONLY");
});
