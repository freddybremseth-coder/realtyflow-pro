import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFinanceOverview } from "@/lib/finance/overview";

test("finance overview aggregates actual ledger without mixing currencies", () => {
  const overview = buildFinanceOverview({
    now: new Date("2026-10-03T10:00:00Z"),
    events: [
      { brand_id: "zeneco", source_type: "crm", direction: "income", status: "paid", amount: 30000, currency: "EUR", event_date: "2026-10-01" },
      { brand_id: "donaanna", source_type: "olivia", direction: "expense", status: "paid", amount: 1200, currency: "EUR", event_date: "2026-10-02" },
      { brand_id: "mondeo", source_type: "family_mondeo", stream: "mondeo_interest", direction: "income", status: "recognized", amount: 33000, currency: "NOK", event_date: "2026-09-30" },
    ],
    documents: [
      { document_type: "invoice", currency: "EUR", total: 5000, balance: 2000, due_date: "2026-09-20" },
    ],
    payments: [
      { currency: "EUR", amount: 3000, payment_date: "2026-09-18" },
    ],
  });

  assert.equal(overview.asOfDate, "2026-10-03");
  assert.equal(overview.currencies.EUR.income, 30000);
  assert.equal(overview.currencies.EUR.expense, 1200);
  assert.equal(overview.currencies.EUR.net, 28800);
  assert.equal(overview.currencies.EUR.cashIn, 30000);
  assert.equal(overview.currencies.EUR.cashOut, 1200);
  assert.equal(overview.currencies.EUR.cashNet, 28800);
  assert.equal(overview.currencies.EUR.outstanding, 2000);
  assert.equal(overview.currencies.EUR.payments, 3000);
  assert.equal(overview.currencies.NOK.income, 33000);
  assert.equal(overview.currencies.NOK.accruedIncome, 33000);
  assert.equal(overview.outstandingInvoiceCount, 1);
  assert.equal(overview.overdueInvoiceCount, 1);
  assert.equal(overview.sourceCounts.olivia, 1);
  assert.equal(overview.latestEventDate, "2026-10-02");
  assert.equal(overview.actualEventCount, 3);
  assert.equal(overview.forecastEventCount, 0);
});

test("metric ledger rows do not inflate income or expense", () => {
  const overview = buildFinanceOverview({
    now: new Date("2026-10-03T10:00:00Z"),
    events: [
      { brand_id: "zeneco", source_type: "crm", direction: "metric", status: "recognized", amount: 600000, currency: "EUR", event_date: "2026-10-01" },
    ],
  });

  assert.equal(overview.currencies.EUR.income, 0);
  assert.equal(overview.currencies.EUR.expense, 0);
  assert.equal(overview.currencies.EUR.net, 0);
  assert.equal(overview.brands[0]?.eventCount, 1);
  assert.equal(overview.actualEventCount, 1);
});

test("future and pending income goes to forecast instead of actual income", () => {
  const overview = buildFinanceOverview({
    now: new Date("2026-10-06T10:00:00Z"),
    events: [
      { brand_id: "soleada", source_type: "crm", stream: "commission", direction: "income", status: "paid", amount: 32000, currency: "EUR", event_date: "2027-06-23" },
      { brand_id: "soleada", source_type: "crm", stream: "commission", direction: "income", status: "pending", amount: 7763, currency: "EUR", event_date: "2026-12-01" },
      { brand_id: "zeneco", source_type: "crm", stream: "commission", direction: "income", status: "paid", amount: 46000, currency: "EUR", event_date: "2026-08-20" },
      { brand_id: "soleada", source_type: "crm", stream: "commission", direction: "income", status: "cancelled", amount: 9999, currency: "EUR", event_date: "2026-08-01" },
    ],
  });

  assert.equal(overview.currencies.EUR.income, 46000);
  assert.equal(overview.currencies.EUR.cashIn, 46000);
  assert.equal(overview.currencies.EUR.forecastIncome, 39763);
  assert.equal(overview.currencies.EUR.pending, 39763);
  assert.equal(overview.actualEventCount, 1);
  assert.equal(overview.forecastEventCount, 2);
  assert.equal(overview.cancelledEventCount, 1);
  assert.equal(overview.latestEventDate, "2026-08-20");
  assert.equal(overview.nextForecastEventDate, "2026-12-01");
});

test("Mondeo stays sourced from Family but is split into balance, cash and capitalized interest", () => {
  const overview = buildFinanceOverview({
    now: new Date("2026-10-06T10:00:00Z"),
    events: [
      { brand_id: "mondeo", source_type: "family_mondeo", stream: "mondeo_balance", direction: "metric", status: "recognized", amount: 4908517, currency: "NOK", event_date: "2026-09-30" },
      { brand_id: "mondeo", source_type: "family_mondeo", stream: "mondeo_interest", direction: "income", status: "recognized", amount: 91218, currency: "NOK", event_date: "2026-09-30" },
      { brand_id: "mondeo", source_type: "family_mondeo", stream: "mondeo_payment", direction: "income", status: "recognized", amount: 36060, currency: "NOK", event_date: "2026-07-03" },
      { brand_id: "mondeo", source_type: "family_mondeo", stream: "mondeo_payment", direction: "income", status: "recognized", amount: 10000, currency: "NOK", event_date: "2026-09-25" },
      { brand_id: "mondeo", source_type: "family_mondeo", stream: "mondeo_payment", direction: "income", status: "recognized", amount: 10000, currency: "NOK", event_date: "2026-09-25" },
    ],
  });

  assert.equal(overview.currencies.NOK.income, 147278);
  assert.equal(overview.currencies.NOK.cashIn, 56060);
  assert.equal(overview.currencies.NOK.accruedIncome, 91218);
  assert.equal(overview.mondeo?.currentBalance, 4908517);
  assert.equal(overview.mondeo?.cashPayments, 56060);
  assert.equal(overview.mondeo?.capitalizedInterest, 91218);
  assert.equal(overview.mondeo?.totalInterestIncome, 147278);
  assert.equal(overview.mondeo?.asOfDate, "2026-09-30");
});
