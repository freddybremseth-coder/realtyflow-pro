import assert from "node:assert/strict";
import { test } from "node:test";
import {
  familyMondeoPaymentsFromTransactions,
  summarizeFamilyEconomyRows,
  summarizeFamilyMondeoTransactions,
} from "@/lib/business/family-economy";

test("Family economy summary groups months and ignores future rows", () => {
  const summary = summarizeFamilyEconomyRows([
    { month: "2026-01-01", olivia_net_nok: -10, realtyflow_net_nok: 110, mondeo_interest_nok: 0 },
    { month: "2026-01-01", olivia_net_nok: -5, realtyflow_net_nok: 55, mondeo_interest_nok: 0 },
    { month: "2026-07-01", olivia_net_nok: 0, realtyflow_net_nok: 0, mondeo_interest_nok: 108_160 },
    { month: "2026-08-01", olivia_net_nok: 0, realtyflow_net_nok: 531_300, mondeo_interest_nok: 0 },
    { month: "2027-06-01", olivia_net_nok: 0, realtyflow_net_nok: 369_600, mondeo_interest_nok: 0 },
  ], new Date(Date.UTC(2026, 6, 4)));

  assert.equal(summary.currentMonth, "2026-07");
  assert.equal(summary.metrics.months, 2);
  assert.equal(summary.latestDate, "2026-07-01");
  assert.equal(summary.ignoredFutureRows, 2);
  assert.equal(summary.metrics.lastMonthTotal, 108_160);
  assert.equal(summary.metrics.ytdTotal, 108_310);
  assert.equal(summary.metrics.oliviaNet, -15);
  assert.equal(summary.metrics.realtyflowNet, 165);
  assert.equal(summary.metrics.mondeoInterest, 108_160);
});

test("Family Mondeo transactions only include actual NOK Mondeo income", () => {
  const rows = [
    {
      id: "tx-1",
      date: "2026-07-03",
      amount: "36060",
      currency: "NOK",
      type: "INCOME",
      category: "Renteinntekt",
      description: "Renteinntekt Mondeo Eiendom AS - Minimum terminbelop iht. avtale",
      is_accrual: false,
    },
    {
      id: "tx-2",
      date: "2026-07-03",
      amount: "36030",
      currency: "NOK",
      type: "INCOME",
      category: "Renteinntekt",
      description: "Renteinntekt Mondeo Eiendom AS - Minimum terminbelop iht. avtale",
      is_accrual: false,
    },
    {
      id: "expense",
      date: "2026-05-25",
      amount: "2971.50",
      currency: "EUR",
      type: "EXPENSE",
      category: "Mondeo",
      description: "Faktura Mondeo Eiendom AS",
      is_accrual: false,
    },
    {
      id: "accrual",
      date: "2026-07-03",
      amount: "36070",
      currency: "NOK",
      type: "INCOME",
      category: "Renteinntekt",
      description: "Renteinntekt Mondeo Eiendom AS",
      is_accrual: true,
    },
  ];

  const payments = familyMondeoPaymentsFromTransactions(rows);
  const summary = summarizeFamilyMondeoTransactions(rows);

  assert.equal(payments.length, 2);
  assert.equal(summary.totalPaid, 72_090);
  assert.deepEqual(payments.map((payment) => payment.source), ["family.transactions", "family.transactions"]);
});
