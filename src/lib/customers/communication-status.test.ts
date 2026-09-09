import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerCommunicationState, summarizeNurtureEvents } from "./communication-status";

const empty = { sentCount: 0, lastSentAt: null, failedCount: 0, lastFailedAt: null, lastError: null };

test("contactable eligible customer with no sends is ready but not sent", () => {
  const state = buildCustomerCommunicationState({ email: "buyer@example.com", pipeline_status: "QUALIFIED", nurture_status: "eligible" }, empty);
  assert.equal(state.status, "READY_NOT_STARTED");
  assert.equal(state.shouldReceiveEmail, true);
  assert.equal(state.sentCount, 0);
});

test("enrolled customer with no sends is auto planned", () => {
  const state = buildCustomerCommunicationState({ email: "buyer@example.com", pipeline_status: "CONTACT", nurture_status: "enrolled" }, empty);
  assert.equal(state.status, "AUTO_PLANNED");
  assert.equal(state.shouldReceiveEmail, true);
});

test("real nurture sent events produce sent status while dry runs do not count", () => {
  const summary = summarizeNurtureEvents([
    { contact_id: "1", status: "sent", dry_run: true, sent_at: "2026-09-01T10:00:00Z" },
    { contact_id: "1", status: "sent", dry_run: false, sent_at: "2026-09-02T10:00:00Z" },
  ]).get("1")!;
  const state = buildCustomerCommunicationState({ email: "buyer@example.com", pipeline_status: "QUALIFIED", nurture_status: "enrolled" }, summary);
  assert.equal(summary.sentCount, 1);
  assert.equal(state.status, "SENT");
  assert.equal(state.lastSentAt, "2026-09-02T10:00:00Z");
});

test("reply after latest send becomes replied and stops automatic eligibility pending state check", () => {
  const state = buildCustomerCommunicationState(
    { email: "buyer@example.com", pipeline_status: "QUALIFIED", nurture_status: "enrolled", last_inbound_reply_at: "2026-09-03T10:00:00Z" },
    { ...empty, sentCount: 1, lastSentAt: "2026-09-02T10:00:00Z" },
  );
  assert.equal(state.status, "REPLIED");
  assert.equal(state.shouldReceiveEmail, false);
});

test("STOPP is authoritative regardless of previous sends or pipeline stage", () => {
  const state = buildCustomerCommunicationState(
    { email: "buyer@example.com", pipeline_status: "QUALIFIED", nurture_status: "enrolled", do_not_contact: true },
    { ...empty, sentCount: 2, lastSentAt: "2026-09-02T10:00:00Z" },
  );
  assert.equal(state.status, "STOPPED");
  assert.equal(state.shouldReceiveEmail, false);
  assert.equal(state.blockedReason, "do_not_contact");
});

test("terminal pipeline customer is closed for sales email", () => {
  for (const pipeline_status of ["WON", "LOST"]) {
    const state = buildCustomerCommunicationState({ email: "buyer@example.com", pipeline_status, nurture_status: "eligible" }, empty);
    assert.equal(state.status, "CLOSED");
    assert.equal(state.shouldReceiveEmail, false);
  }
});
