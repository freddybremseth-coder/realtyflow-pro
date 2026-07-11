import assert from "node:assert/strict";
import test from "node:test";
import { buildRevenueCommandCenter } from "./command";

const now = new Date("2026-07-11T12:00:00.000Z");

function baseContacts() {
  return [
    {
      id: "closing-1",
      name: "Closing Kunde",
      email: "closing@example.com",
      phone: "+34111111111",
      pipeline_status: "NEGOTIATION",
      pipeline_value: 600_000,
      brand_id: "soleada",
      notes: "Budsjett og finansiering avklart. Favorittbolig valgt.",
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-06-20T10:00:00.000Z",
      next_followup: "2026-07-01T09:00:00.000Z",
    },
    {
      id: "commission-1",
      name: "Vunnet Kunde",
      email: "won@example.com",
      pipeline_status: "WON",
      pipeline_value: 500_000,
      commission_amount: 20_000,
      brand_id: "zeneco",
      won_at: "2026-05-01T10:00:00.000Z",
      updated_at: "2026-06-01T10:00:00.000Z",
      interactions: [
        {
          action: "commission_invoice_sent",
          date: "2026-06-01T10:00:00.000Z",
          metadata: { due_date: "2026-06-15T10:00:00.000Z", invoice_number: "INV-1" },
        },
      ],
    },
    {
      id: "keyholding-1",
      name: "Keyholding Kunde",
      email: "key@example.com",
      pipeline_status: "WON",
      pipeline_value: 300_000,
      brand_id: "keyholding",
      won_at: "2025-12-01T10:00:00.000Z",
      interactions: [
        {
          action: "keyholding_contract_started",
          date: "2026-01-01T10:00:00.000Z",
          metadata: { plan: "BASIC", renewal_at: "2027-01-01T09:00:00.000Z" },
        },
      ],
    },
    {
      id: "recovery-1",
      name: "Recovery Kunde",
      email: "recovery@example.com",
      pipeline_status: "LOST",
      pipeline_value: 450_000,
      brand_id: "soleada",
      notes: "Kunden var ikke klar ennå og ønsket å vente på riktig timing.",
      lost_at: "2026-05-01T10:00:00.000Z",
      updated_at: "2026-05-01T10:00:00.000Z",
      next_followup: "2026-07-01T09:00:00.000Z",
    },
    {
      id: "approval-1",
      name: "Approval Kunde",
      email: "approval@example.com",
      pipeline_status: "CONTACT",
      brand_id: "zeneco",
      created_at: "2026-07-09T10:00:00.000Z",
      updated_at: "2026-07-09T10:00:00.000Z",
      next_followup: "2026-07-20T09:00:00.000Z",
    },
  ];
}

test("aggregates sales, cash, recovery, approvals and recurring revenue", () => {
  const command = buildRevenueCommandCenter({
    contacts: baseContacts(),
    profiles: [{ id: "profile-1", contact_id: "approval-1", brand: "zeneco", status: "draft", created_at: "2026-07-08T10:00:00.000Z" }],
  }, now);

  assert.equal(command.summary.overdueCommission, 20_000);
  assert.equal(command.summary.monthlyRecurringRevenue, 55);
  assert.equal(command.summary.annualRecurringRevenue, 660);
  assert.equal(command.summary.approvalReady, 1);
  assert.equal(command.summary.recoverNow, 1);
  assert.ok(command.summary.closingHighRisk >= 1);
  assert.ok(command.summary.forecast30Commission > 0);
  assert.equal(command.safety.readOnly, true);
});

test("prioritizes overdue commission and deduplicates each contact", () => {
  const command = buildRevenueCommandCenter({ contacts: baseContacts() }, now);
  const commissionAction = command.topActions.find((item) => item.contactId === "commission-1");
  assert.equal(commissionAction?.source, "commissions");
  assert.equal(commissionAction?.priority, "CRITICAL");

  const ids = command.topActions.map((item) => item.contactId).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});

test("keeps active Keyholding revenue separate from potential revenue", () => {
  const command = buildRevenueCommandCenter({ contacts: baseContacts() }, now);
  assert.equal(command.summary.monthlyRecurringRevenue, 55);
  assert.ok(command.summary.potentialAnnualRecurringRevenue > 0);
  assert.notEqual(command.summary.potentialAnnualRecurringRevenue, command.summary.annualRecurringRevenue);
});

test("preserves optional table warnings", () => {
  const command = buildRevenueCommandCenter({ contacts: [], warnings: ["buyer_profiles unavailable"] }, now);
  assert.deepEqual(command.warnings, ["buyer_profiles unavailable"]);
  assert.equal(command.summary.activeDeals, 0);
  assert.equal(command.topActions.length, 0);
});
