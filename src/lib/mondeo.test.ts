import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMondeoMinimumPaymentStatus, summarizeMondeoLedgerEvents } from "@/lib/mondeo";

test("Mondeo ledger summary only counts explicit RealtyFlow payment and KPI streams", () => {
  const summary = summarizeMondeoLedgerEvents([
    {
      id: "payment",
      stream: "mondeo_payment",
      direction: "income",
      status: "paid",
      amount: "33000",
      currency: "NOK",
      event_date: "2026-07-01",
      description: "Terminbetaling Mondeo",
      source_type: "manual",
    },
    {
      id: "kpi",
      stream: "kpi_adjustment",
      direction: "metric",
      status: "recognized",
      amount: "12000",
      currency: "NOK",
      event_date: "2027-01-01",
      description: "KPI-justering",
      source_type: "manual",
    },
    {
      id: "stale-interest",
      stream: "mondeo_interest",
      direction: "income",
      status: "recognized",
      amount: "108160",
      currency: "NOK",
      event_date: "2026-07-01",
      description: "Family resultatsammendrag, ikke innbetaling",
      source_type: "manual",
    },
    {
      id: "pending",
      stream: "mondeo_payment",
      direction: "income",
      status: "pending",
      amount: "33000",
      currency: "NOK",
      event_date: "2026-08-01",
      description: "Ikke mottatt ennå",
      source_type: "manual",
    },
    {
      id: "wrong-currency",
      stream: "mondeo_payment",
      direction: "income",
      status: "paid",
      amount: "33000",
      currency: "EUR",
      event_date: "2026-09-01",
      description: "Feil valuta",
      source_type: "manual",
    },
  ]);

  assert.equal(summary.payments.length, 1);
  assert.equal(summary.kpiAdjustments.length, 1);
  assert.equal(summary.totalPaid, 33_000);
  assert.equal(summary.totalKpiAdjustment, 12_000);
  assert.equal(summary.totalReceivedAndKpi, 45_000);
});

test("Mondeo minimum payment gap uses actual registered payments, not contract-model payments", () => {
  const asOf = new Date(Date.UTC(2026, 6, 5));

  assert.deepEqual(calculateMondeoMinimumPaymentStatus({ asOf, payments: [] }), {
    monthsDue: 2,
    totalMinimumDue: 66_000,
    totalPaid: 0,
    gapToMinimum: 66_000,
  });

  assert.deepEqual(
    calculateMondeoMinimumPaymentStatus({
      asOf,
      payments: [
        { date: "2026-06-01", amount: 33_000, source: "business_financial_events" },
        { date: "2026-08-01", amount: 33_000, source: "business_financial_events" },
      ],
    }),
    {
      monthsDue: 2,
      totalMinimumDue: 66_000,
      totalPaid: 33_000,
      gapToMinimum: 33_000,
    },
  );
});
