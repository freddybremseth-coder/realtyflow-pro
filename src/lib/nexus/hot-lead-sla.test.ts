import assert from "node:assert/strict";
import test from "node:test";
import { decideHotLeadSla, responseDueAt } from "./hot-lead-sla";

test("viewing request gets five-minute critical SLA", () => {
  const decision = decideHotLeadSla({ intent: "viewing_request", requiresFastResponse: true });
  assert.equal(decision.isHotLead, true);
  assert.equal(decision.priority, "CRITICAL");
  assert.equal(decision.responseMinutes, 5);
  assert.equal(decision.operationalTarget, "VIEWING");
});

test("specific property interest gets five-minute critical SLA", () => {
  const decision = decideHotLeadSla({ intent: "property_interest", requiresFastResponse: true });
  assert.equal(decision.priority, "CRITICAL");
  assert.equal(decision.responseMinutes, 5);
  assert.equal(decision.operationalTarget, "PROPERTY_MATCHING");
});

test("active interest stays high priority with ten-minute response target", () => {
  const decision = decideHotLeadSla({ intent: "active_interest", requiresFastResponse: true });
  assert.equal(decision.priority, "HIGH");
  assert.equal(decision.responseMinutes, 10);
});

test("preference changes route to buyer profile refresh", () => {
  const decision = decideHotLeadSla({ intent: "update_preferences", requiresFastResponse: false });
  assert.equal(decision.isHotLead, true);
  assert.equal(decision.operationalTarget, "BUYER_PROFILE");
  assert.equal(decision.responseMinutes, 15);
});

test("later follow-up is not treated as hot lead", () => {
  const decision = decideHotLeadSla({ intent: "follow_up_later", requiresFastResponse: false });
  assert.equal(decision.isHotLead, false);
  assert.equal(decision.responseMinutes, null);
});

test("response due timestamp is deterministic", () => {
  assert.equal(responseDueAt("2026-09-08T07:00:00.000Z", 5), "2026-09-08T07:05:00.000Z");
  assert.equal(responseDueAt("2026-09-08T07:00:00.000Z", null), null);
});
