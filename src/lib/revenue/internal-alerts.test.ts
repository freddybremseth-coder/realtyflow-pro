import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamWorkload } from "./team-workload";
import { buildInternalAlertCenter, type InternalAlertAcknowledgement } from "./internal-alerts";

const now = new Date("2026-07-11T12:00:00.000Z");
const profiles: any[] = [
  { email: "sales@example.com", displayName: "Sara Sales", role: "SALES", active: true, createdAt: null, updatedAt: null, updatedBy: null },
  { email: "closing@example.com", displayName: "Clara Closing", role: "CLOSING", active: true, createdAt: null, updatedAt: null, updatedBy: null },
];

function center(contacts: any[], workItems: any[] = [], acknowledgements: InternalAlertAcknowledgement[] = []) {
  const team = buildTeamWorkload({ contacts, workItems, profiles, ownerEmails: ["owner@example.com"], now });
  return buildInternalAlertCenter({ contacts, team, acknowledgements, now });
}

test("critical unassigned negotiation and high-risk closing become active alerts", () => {
  const alerts = center([{
    id: "deal-1",
    name: "Negotiation Buyer",
    brand_id: "soleada",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 650000,
    next_followup: "2026-07-09",
    notes: "Preferred villa selected",
  }]);
  assert.equal(alerts.active.some((alert) => alert.ruleId === "UNASSIGNED_PRIORITY_WORK"), true);
  const closing = alerts.active.find((alert) => alert.ruleId === "CLOSING_HIGH_RISK");
  assert.equal(closing?.severity, "CRITICAL");
  assert.equal(closing?.category, "CLOSING");
  assert.equal(alerts.summary.immediate >= 1, true);
});

test("overdue confirmed commission creates finance escalation without using fallback estimate", () => {
  const alerts = center([{
    id: "won-1",
    name: "Won Buyer",
    brand_id: "zeneco",
    pipeline_status: "WON",
    sale_price: 500000,
    commission_amount: 30000,
    won_at: "2026-05-01",
    interactions: [{
      action: "commission_invoice_sent",
      date: "2026-05-10T10:00:00.000Z",
      metadata: { due_date: "2026-05-24", invoice_number: "INV-1" },
    }],
  }]);
  const finance = alerts.active.find((alert) => alert.ruleId === "COMMISSION_OVERDUE");
  assert.equal(finance?.severity, "CRITICAL");
  assert.equal(finance?.amountEur, 30000);
  assert.equal(finance?.category, "FINANCE");
});

test("keyholding renewal due creates a keyholding alert", () => {
  const alerts = center([{
    id: "key-1",
    name: "Keyholding Customer",
    brand_id: "keyholding",
    pipeline_status: "WON",
    next_followup: "2026-07-10",
    interactions: [{
      action: "keyholding_contract_started",
      date: "2025-07-01T10:00:00.000Z",
      metadata: { plan: "STANDARD", renewal_at: "2026-07-01" },
    }],
  }]);
  const keyholding = alerts.active.find((alert) => alert.ruleId === "KEYHOLDING_RENEWAL");
  assert.equal(keyholding?.category, "KEYHOLDING");
  assert.equal(keyholding?.severity, "CRITICAL");
  assert.equal(keyholding?.amountEur, 89);
});

test("matching acknowledgement hides the current fingerprint while changed conditions reactivate it", () => {
  const contacts = [{
    id: "deal-2",
    name: "Risk Buyer",
    brand_id: "soleada",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 400000,
    next_followup: "2026-07-10",
  }];
  const initial = center(contacts);
  const alert = initial.active.find((item) => item.ruleId === "CLOSING_HIGH_RISK");
  assert.ok(alert);
  const acknowledgement: InternalAlertAcknowledgement = {
    id: "ack-1",
    alertId: alert.id,
    fingerprint: alert.fingerprint,
    action: "ACKNOWLEDGED",
    at: "2026-07-11T11:00:00.000Z",
    actorEmail: "closing@example.com",
    note: "Gjennomgått",
  };
  const acknowledged = center(contacts, [], [acknowledgement]);
  assert.equal(acknowledged.active.some((item) => item.id === alert.id), false);
  assert.equal(acknowledged.acknowledged.some((item) => item.id === alert.id), true);

  const changed = center([{ ...contacts[0], pipeline_value: 600000 }], [], [acknowledgement]);
  assert.equal(changed.active.some((item) => item.id === alert.id), true);
});

test("assigned overdue high-priority task becomes an execution alert and team overload is detected", () => {
  const workItems = Array.from({ length: 5 }, (_, index) => ({
    id: `task-${index}`,
    title: `Critical task ${index}`,
    description: "Internal follow-up",
    status: "TO_DO",
    priority: index < 2 ? "CRITICAL" : "HIGH",
    due_date: "2026-07-09",
    assigned_agent: "sales@example.com",
    brand_id: "soleada",
    ai_score: 90,
  }));
  const alerts = center([], workItems);
  assert.equal(alerts.active.some((alert) => alert.ruleId === "ASSIGNED_TASK_OVERDUE"), true);
  const overload = alerts.active.find((alert) => alert.ruleId === "TEAM_OVERLOAD");
  assert.equal(overload?.severity, "CRITICAL");
  assert.equal(overload?.ownerEmail, "sales@example.com");
});
