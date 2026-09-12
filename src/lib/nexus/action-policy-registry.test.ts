import assert from "node:assert/strict";
import test from "node:test";
import { canExecuteAutomatically, getNexusActionPolicy, listNexusActionPolicies, policyForRevenueAction } from "./action-policy-registry";

test("only explicitly safe actions may execute automatically", () => {
  const safe = ["crm_note_update","buyer_profile_exact_evidence_update","property_match_prepare","shortlist_draft_prepare","presentation_draft_prepare","criteria_clarification_email"] as const;
  for (const actionType of safe) {
    const policy = getNexusActionPolicy(actionType);
    assert.equal(policy.policyClass, "AUTO_SAFE");
    assert.equal(canExecuteAutomatically(policy), true);
  }
  for (const policy of listNexusActionPolicies().filter((item) => !safe.includes(item.actionType as (typeof safe)[number]))) assert.equal(canExecuteAutomatically(policy), false);
});

test("customer-facing sends and commitments fail closed", () => {
  assert.equal(getNexusActionPolicy("general_customer_message").policyClass, "DRAFT_ONLY");
  assert.equal(getNexusActionPolicy("property_recommendation_send").policyClass, "HUMAN_REQUIRED");
  assert.equal(getNexusActionPolicy("viewing_booking").policyClass, "HUMAN_REQUIRED");
  assert.equal(getNexusActionPolicy("legal_or_contract_commitment").policyClass, "FORBIDDEN");
  assert.equal(getNexusActionPolicy("price_or_availability_guarantee").policyClass, "FORBIDDEN");
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
