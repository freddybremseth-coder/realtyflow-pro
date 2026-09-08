import assert from "node:assert/strict";
import test from "node:test";
import { readHotLeadSla } from "./hot-lead-work-item";

const now = new Date("2026-09-08T08:00:00.000Z");

test("hot lead with expired response target is SLA overdue", () => {
  const value = readHotLeadSla({
    hot_lead: true,
    response_due_at: "2026-09-08T07:59:00.000Z",
    response_sla_minutes: 5,
    operational_target: "viewing",
    buyer_profile_id: "profile-1",
    stage_readiness_href: "/lead-intelligence?buyerProfileId=profile-1",
  }, now);

  assert.equal(value.hotLead, true);
  assert.equal(value.isSlaOverdue, true);
  assert.equal(value.responseSlaMinutes, 5);
  assert.equal(value.operationalTarget, "viewing");
  assert.equal(value.stageReadinessHref, "/lead-intelligence?buyerProfileId=profile-1");
});

test("future hot lead remains inside SLA", () => {
  const value = readHotLeadSla({
    hot_lead: true,
    response_due_at: "2026-09-08T08:05:00.000Z",
    response_sla_minutes: 5,
  }, now);
  assert.equal(value.hotLead, true);
  assert.equal(value.isSlaOverdue, false);
});

test("ordinary work item never becomes SLA overdue from stale metadata alone", () => {
  const value = readHotLeadSla({
    hot_lead: false,
    response_due_at: "2026-09-08T07:00:00.000Z",
  }, now);
  assert.equal(value.hotLead, false);
  assert.equal(value.isSlaOverdue, false);
});

test("malformed metadata fails closed without inventing SLA", () => {
  const value = readHotLeadSla(null, now);
  assert.equal(value.hotLead, false);
  assert.equal(value.responseDueAt, null);
  assert.equal(value.isSlaOverdue, false);
});
