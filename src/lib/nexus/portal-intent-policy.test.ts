import test from "node:test";
import assert from "node:assert/strict";
import { decidePortalIntent, portalResponseDueAt, portalWorkItemMetadata } from "./portal-intent-policy";

test("session activity stays informational", () => {
  const decision = decidePortalIntent("session_active");
  assert.equal(decision.hotLead, false);
  assert.equal(decision.createWorkItem, false);
  assert.equal(decision.responseMinutes, null);
});

test("repeat property views become a governed hot lead", () => {
  const decision = decidePortalIntent("repeat_property_view");
  assert.equal(decision.hotLead, true);
  assert.equal(decision.priority, "HIGH");
  assert.equal(decision.responseMinutes, 30);
  assert.equal(decision.createWorkItem, true);
});

test("explicit property interest gets the fastest portal SLA", () => {
  const decision = decidePortalIntent("property_interested");
  assert.equal(decision.hotLead, true);
  assert.equal(decision.priority, "CRITICAL");
  assert.equal(decision.responseMinutes, 5);
  assert.equal(decision.aiScore, 98);
});

test("portal message routes to customer reply", () => {
  const metadata = portalWorkItemMetadata("customer_message", "2026-09-08T10:00:00.000Z");
  assert.equal(metadata.hot_lead, true);
  assert.equal(metadata.response_sla_minutes, 10);
  assert.equal(metadata.response_due_at, "2026-09-08T10:10:00.000Z");
  assert.equal(metadata.operational_target, "CUSTOMER_REPLY");
  assert.equal(metadata.stage_readiness_href, "/nexus-os/replies");
});

test("invalid base timestamps are rejected", () => {
  assert.throws(() => portalResponseDueAt("not-a-date", 5));
});
