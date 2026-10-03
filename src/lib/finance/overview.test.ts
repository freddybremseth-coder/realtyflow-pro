import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFinanceOverview } from "@/lib/finance/overview";

test("finance overview aggregates canonical ledger without mixing currencies", () => {
  const overview = buildFinanceOverview({
    now: new Date("2026-10-03T10:00:00Z"),
    events: [
      { brand_id: "zeneco", source_type: "crm", direction: "income", status: "paid", amount: 30000, currency: "EUR", event_date: "2026-10-01" },
      { brand_id: "donaanna", source_type: "olivia", direction: "expense", status: "paid", amount: 1200, currency: "EUR", event_date: "2026-10-02" },
      { brand_id: "mondeo", source_type: "family", direction: "income", status: "recognized", amount: 33000, currency: "NOK", event_date: "2026-09-30" },
    ],
    documents: [
      { document_type: "invoice", currency: "EUR", total: 5000, balance: 2000, due_date: "2026-09-20" },
    ],
    payments: [
      { currency: "EUR", amount: 3000, payment_date: "2026-09-18" },
    ],
  });

  assert.equal(overview.currencies.EUR.income, 30000);
  assert.equal(overview.currencies.EUR.expense, 1200);
  assert.equal(overview.currencies.EUR.net, 28800);
  assert.equal(overview.currencies.EUR.outstanding, 2000);
  assert.equal(overview.currencies.EUR.payments, 3000);
  assert.equal(overview.currencies.NOK.income, 33000);
  assert.equal(overview.outstandingInvoiceCount, 1);
  assert.equal(overview.overdueInvoiceCount, 1);
  assert.equal(overview.sourceCounts.olivia, 1);
  assert.equal(overview.latestEventDate, "2026-10-02");
});

test("metric ledger rows do not inflate income or expense", () => {
  const overview = buildFinanceOverview({
    events: [
      { brand_id: "zeneco", source_type: "crm", direction: "metric", status: "recognized", amount: 600000, currency: "EUR", event_date: "2026-10-01" },
    ],
  });
  assert.equal(overview.currencies.EUR.income, 0);
  assert.equal(overview.currencies.EUR.expense, 0);
  assert.equal(overview.currencies.EUR.net, 0);
  assert.equal(overview.brands[0]?.eventCount, 1);
});
