import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommissionCase,
  buildCommissionCollection,
  sortCommissionCases,
  type CommissionContactInput,
} from "./commissions";

const NOW = new Date("2026-07-11T12:00:00.000Z");

function won(overrides: Partial<CommissionContactInput> = {}): CommissionContactInput {
  return {
    id: "contact-1",
    name: "Kunde",
    pipeline_status: "WON",
    sale_price: 500_000,
    won_at: "2026-06-01T10:00:00.000Z",
    email: "kunde@example.com",
    interactions: [],
    ...overrides,
  };
}

test("excludes contacts that are not won", () => {
  assert.equal(buildCommissionCase(won({ pipeline_status: "NEGOTIATION" }), NOW), null);
});

test("uses explicit commission amount as confirmed receivable", () => {
  const item = buildCommissionCase(won({ commission_amount: 22_500 }), NOW);
  assert.ok(item);
  assert.equal(item.commissionAmount, 22_500);
  assert.equal(item.commissionConfirmed, true);
  assert.equal(item.commissionEstimated, false);
  assert.equal(item.status, "READY_TO_INVOICE");
});

test("calculates confirmed commission from sale price and percent", () => {
  const item = buildCommissionCase(won({ commission_percent: 4 }), NOW);
  assert.ok(item);
  assert.equal(item.commissionAmount, 20_000);
  assert.equal(item.commissionPercent, 4);
  assert.equal(item.commissionConfirmed, true);
});

test("keeps fallback estimate separate when terms are missing", () => {
  const item = buildCommissionCase(won(), NOW);
  assert.ok(item);
  assert.equal(item.commissionAmount, 15_000);
  assert.equal(item.commissionConfirmed, false);
  assert.equal(item.commissionEstimated, true);
  assert.equal(item.status, "MISSING_TERMS");
  assert.match(item.recommendedAction, /Registrer faktisk provisjonsbeløp/);
});

test("recognizes prepared and sent invoice events", () => {
  const prepared = buildCommissionCase(won({
    commission_percent: 3,
    interactions: [{
      action: "commission_invoice_prepared",
      date: "2026-07-01T10:00:00.000Z",
      metadata: { invoice_number: "2026-101" },
    }],
  }), NOW);
  assert.equal(prepared?.status, "INVOICE_PREPARED");
  assert.equal(prepared?.invoiceNumber, "2026-101");

  const sent = buildCommissionCase(won({
    commission_percent: 3,
    interactions: [{
      action: "commission_invoice_sent",
      date: "2026-07-08T10:00:00.000Z",
      metadata: { due_date: "2026-07-22T10:00:00.000Z", invoice_number: "2026-102" },
    }],
  }), NOW);
  assert.equal(sent?.status, "INVOICED");
  assert.equal(sent?.invoiceDueAt, "2026-07-22T10:00:00.000Z");
});

test("marks unpaid invoice overdue after due date", () => {
  const item = buildCommissionCase(won({
    commission_amount: 30_000,
    interactions: [{
      action: "commission_invoice_sent",
      date: "2026-06-01T10:00:00.000Z",
      metadata: { due_date: "2026-06-15T10:00:00.000Z" },
    }],
  }), NOW);
  assert.ok(item);
  assert.equal(item.status, "OVERDUE");
  assert.equal(item.priority, "HIGH");
  assert.match(item.issues.join(" "), /forfalt/);
});

test("paid date overrides invoice and overdue states", () => {
  const item = buildCommissionCase(won({
    commission_amount: 18_000,
    commission_paid_date: "2026-07-05T10:00:00.000Z",
    interactions: [{
      action: "commission_invoice_sent",
      date: "2026-06-01T10:00:00.000Z",
      metadata: { due_date: "2026-06-15T10:00:00.000Z" },
    }],
  }), NOW);
  assert.equal(item?.status, "PAID");
  assert.equal(item?.paidAt, "2026-07-05T10:00:00.000Z");
});

test("summary separates confirmed, estimated, outstanding and paid amounts", () => {
  const result = buildCommissionCollection([
    won({ id: "ready", commission_amount: 20_000 }),
    won({ id: "estimate", sale_price: 400_000 }),
    won({
      id: "outstanding",
      commission_amount: 12_000,
      interactions: [{ action: "commission_invoice_sent", date: "2026-07-08T10:00:00.000Z", metadata: { due_date: "2026-07-25T10:00:00.000Z" } }],
    }),
    won({ id: "paid", commission_amount: 8_000, commission_paid_date: "2026-07-01T10:00:00.000Z" }),
  ], NOW);

  assert.equal(result.summary.confirmedCommission, 40_000);
  assert.equal(result.summary.estimatedUnconfirmedCommission, 12_000);
  assert.equal(result.summary.readyToInvoiceCommission, 20_000);
  assert.equal(result.summary.invoicedOutstandingCommission, 12_000);
  assert.equal(result.summary.paidCommission, 8_000);
  assert.equal(result.summary.missingTermsCount, 1);
});

test("sorts overdue high-value collection cases first", () => {
  const overdue = buildCommissionCase(won({
    id: "overdue",
    commission_amount: 40_000,
    interactions: [{ action: "commission_invoice_sent", date: "2026-05-01T10:00:00.000Z", metadata: { due_date: "2026-05-15T10:00:00.000Z" } }],
  }), NOW)!;
  const ready = buildCommissionCase(won({ id: "ready", commission_amount: 5_000, won_at: "2026-07-10T10:00:00.000Z" }), NOW)!;

  assert.deepEqual(sortCommissionCases([ready, overdue]).map((item) => item.id), ["overdue", "ready"]);
});
