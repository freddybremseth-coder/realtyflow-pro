import assert from "node:assert/strict";
import test from "node:test";
import { isActiveCustomerWorkStatus, resolveCanonicalCustomerState } from "./canonical-customer-state";

test("explicit purchased-elsewhere reply overrides stale qualified stage", () => {
  const state = resolveCanonicalCustomerState({
    pipeline_status: "QUALIFIED",
    last_reply_classification: "purchased_elsewhere",
    email_suppressed: true,
  });
  assert.equal(state.lifecycle, "LOST");
  assert.equal(state.effectivePipelineStatus, "LOST");
  assert.equal(state.label, "Tapt – kjøpt annet sted");
  assert.equal(state.salesActive, false);
  assert.equal(state.communicationBlocked, true);
  assert.equal(state.needsPipelineReconciliation, true);
  assert.equal(state.source, "reply");
});

test("terminal suppression reason overrides stale qualified stage", () => {
  const state = resolveCanonicalCustomerState({
    pipeline_status: "QUALIFIED",
    suppression_reason: "customer_no_longer_buying",
    email_suppressed: true,
  });
  assert.equal(state.lifecycle, "LOST");
  assert.equal(state.label, "Tapt – ikke lenger på boligjakt");
  assert.equal(state.needsPipelineReconciliation, true);
  assert.equal(state.source, "suppression");
});

test("do not contact outranks other states without inventing pipeline loss", () => {
  const state = resolveCanonicalCustomerState({
    pipeline_status: "QUALIFIED",
    do_not_contact: true,
  });
  assert.equal(state.lifecycle, "DNC");
  assert.equal(state.effectivePipelineStatus, "QUALIFIED");
  assert.equal(state.label, "Ikke kontakt");
  assert.equal(state.communicationBlocked, true);
  assert.equal(state.salesActive, false);
});

test("won and lost pipeline states remain authoritative", () => {
  assert.equal(resolveCanonicalCustomerState({ pipeline_status: "WON" }).lifecycle, "WON");
  assert.equal(resolveCanonicalCustomerState({ pipeline_status: "LOST", lost_reason: "purchased_elsewhere" }).label, "Tapt – kjøpt annet sted");
});

test("active work status only includes operational statuses", () => {
  assert.equal(isActiveCustomerWorkStatus("TO_DO"), true);
  assert.equal(isActiveCustomerWorkStatus("IN_PROGRESS"), true);
  assert.equal(isActiveCustomerWorkStatus("REVIEW"), true);
  assert.equal(isActiveCustomerWorkStatus("CANCELLED"), false);
  assert.equal(isActiveCustomerWorkStatus("DONE"), false);
});
