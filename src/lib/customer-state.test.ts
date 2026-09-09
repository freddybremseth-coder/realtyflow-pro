import assert from "node:assert/strict";
import test from "node:test";
import { resolveCustomerState } from "./customer-state";

test("explicit terminal reply overrides stale active pipeline for operational decisions", () => {
  const state = resolveCustomerState({
    pipeline_status: "QUALIFIED",
    last_reply_classification: "no_longer_buying",
    email_suppressed: true,
    nurture_status: "stopped",
  });
  assert.equal(state.rawPipelineStatus, "QUALIFIED");
  assert.equal(state.pipelineStatus, "LOST");
  assert.equal(state.terminal, true);
  assert.equal(state.canCreateHotLead, false);
  assert.equal(state.activeSalesWorkAllowed, false);
  assert.equal(state.reconciliationNeeded, true);
});

test("purchased elsewhere cannot remain operationally active even before reconciliation", () => {
  const state = resolveCustomerState({ pipeline_status: "CONTACT", last_reply_classification: "purchased_elsewhere" });
  assert.equal(state.pipelineStatus, "LOST");
  assert.equal(state.canReceiveSalesEmail, false);
  assert.equal(state.canCreateHotLead, false);
});

test("explicit STOPP remains authoritative independently of pipeline stage", () => {
  const state = resolveCustomerState({
    pipeline_status: "VIEWING",
    do_not_contact: true,
    email_suppressed: true,
    suppression_reason: "customer_unsubscribe_reply",
  });
  assert.equal(state.pipelineStatus, "VIEWING");
  assert.equal(state.doNotContact, true);
  assert.equal(state.canReceiveSalesEmail, false);
  assert.equal(state.canCreateHotLead, false);
  assert.equal(state.activeSalesWorkAllowed, true);
});

test("normal active customer remains eligible for sales work and hot-lead routing", () => {
  const state = resolveCustomerState({ pipeline_status: "QUALIFIED", nurture_status: "paused" });
  assert.equal(state.pipelineStatus, "QUALIFIED");
  assert.equal(state.terminal, false);
  assert.equal(state.canCreateHotLead, true);
  assert.equal(state.activeSalesWorkAllowed, true);
  assert.equal(state.reconciliationNeeded, false);
});

test("WON and LOST are terminal regardless of stale follow-up metadata", () => {
  for (const stage of ["WON", "LOST"] as const) {
    const state = resolveCustomerState({ pipeline_status: stage, email_suppressed: false, nurture_status: "active" });
    assert.equal(state.terminal, true);
    assert.equal(state.canCreateHotLead, false);
    assert.equal(state.canReceiveSalesEmail, false);
    assert.equal(state.activeSalesWorkAllowed, false);
  }
});
