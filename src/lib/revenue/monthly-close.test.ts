import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthlyCloseReport } from "./monthly-close";

const JULY_START = "2026-07-01";
const AFTER_JULY = new Date("2026-08-10T12:00:00.000Z");

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    name: "Test Customer",
    brand_id: "soleada",
    pipeline_status: "WON",
    pipeline_value: 500_000,
    commission_percent: 4,
    won_at: "2026-07-10T10:00:00.000Z",
    created_at: "2026-07-01T10:00:00.000Z",
    interactions: [],
    ...overrides,
  };
}

function event(action: string, date: string, metadata: Record<string, unknown> = {}) {
  return { action, date, metadata };
}

test("periodizes earned, invoiced and collected commission independently", () => {
  const julySale = contact({
    id: "july-sale",
    interactions: [
      event("commission_invoice_sent", "2026-07-15T10:00:00.000Z", { invoice_number: "INV-1", due_date: "2026-07-29T10:00:00.000Z" }),
      event("commission_payment_received", "2026-08-02T10:00:00.000Z"),
    ],
  });
  const oldSalePaidInJuly = contact({
    id: "old-sale",
    won_at: "2026-06-10T10:00:00.000Z",
    commission_amount: 12_000,
    commission_percent: null,
    interactions: [
      event("commission_invoice_sent", "2026-07-05T10:00:00.000Z", { invoice_number: "INV-2" }),
      event("commission_payment_received", "2026-07-20T10:00:00.000Z"),
    ],
  });

  const report = buildMonthlyCloseReport({ contacts: [julySale, oldSalePaidInJuly], scope: "all", periodStart: JULY_START, now: AFTER_JULY });

  assert.equal(report.summary.earnedCommission, 20_000);
  assert.equal(report.summary.invoicedCommission, 32_000);
  assert.equal(report.summary.collectedCommission, 12_000);
  assert.equal(report.summary.wonDeals, 1);
  assert.equal(report.deals.length, 2);
});

test("excludes estimated commission and blocks close when terms are missing", () => {
  const missingTerms = contact({ commission_percent: null, commission_amount: null });
  const report = buildMonthlyCloseReport({ contacts: [missingTerms], scope: "soleada", periodStart: JULY_START, now: AFTER_JULY });

  assert.equal(report.summary.earnedCommission, 0);
  assert.equal(report.summary.estimatedCommissionExcluded, 15_000);
  assert.equal(report.commission.missingTermsCount, 1);
  assert.equal(report.closeStatus, "REVIEW_REQUIRED");
  assert.equal(report.checks.find((item) => item.id === "commission-terms")?.status, "BLOCKED");
});

test("reconstructs Keyholding MRR at month end from lifecycle events", () => {
  const activeThenCancelled = contact({
    id: "active-july",
    pipeline_status: "WON",
    interactions: [
      event("keyholding_contract_started", "2026-06-10T10:00:00.000Z", { plan: "STANDARD" }),
      event("keyholding_contract_cancelled", "2026-08-03T10:00:00.000Z"),
    ],
  });
  const pausedDuringJuly = contact({
    id: "paused-july",
    interactions: [
      event("keyholding_contract_started", "2026-07-02T10:00:00.000Z", { plan: "PREMIUM" }),
      event("keyholding_contract_paused", "2026-07-25T10:00:00.000Z", { plan: "PREMIUM" }),
    ],
  });
  const missingPlan = contact({
    id: "missing-plan",
    interactions: [event("keyholding_contract_started", "2026-07-08T10:00:00.000Z")],
  });

  const report = buildMonthlyCloseReport({ contacts: [activeThenCancelled, pausedDuringJuly, missingPlan], scope: "keyholding", periodStart: JULY_START, now: AFTER_JULY });

  assert.equal(report.summary.monthEndKeyholdingMrr, 89);
  assert.equal(report.keyholding.activeAtMonthEnd, 2);
  assert.equal(report.keyholding.missingPlanAtMonthEnd, 1);
  assert.equal(report.summary.newKeyholdingContracts, 2);
  assert.equal(report.summary.pausedKeyholdingContracts, 1);
  assert.equal(report.checks.find((item) => item.id === "keyholding-plans")?.status, "BLOCKED");
});

test("uses only documented spend and confirmed cohort commission for ROAS", () => {
  const googleLead = contact({
    source: "Google Ads",
    utm_source: "google ads",
    created_at: "2026-07-03T10:00:00.000Z",
    commission_amount: 20_000,
  });
  const report = buildMonthlyCloseReport({
    contacts: [googleLead],
    scope: "all",
    periodStart: JULY_START,
    spend: [{ sourceId: "google-ads", spendEur: 2_000 }],
    now: AFTER_JULY,
  });

  assert.equal(report.summary.marketingSpend, 2_000);
  assert.equal(report.summary.marketingContribution, 18_000);
  assert.equal(report.summary.cohortEarnedRoas, 10);
  assert.equal(report.marketing.sources.find((item) => item.sourceId === "google-ads")?.won, 1);
});

test("filters real-estate financials by selected brand", () => {
  const soleada = contact({ id: "soleada", commission_amount: 10_000 });
  const zeneco = contact({ id: "zeneco", brand_id: "zeneco", commission_amount: 30_000 });
  const report = buildMonthlyCloseReport({ contacts: [soleada, zeneco], scope: "soleada", periodStart: JULY_START, now: AFTER_JULY });

  assert.equal(report.summary.earnedCommission, 10_000);
  assert.equal(report.summary.wonDeals, 1);
  assert.deepEqual(report.brands.map((item) => item.brandId), ["soleada"]);
});

test("keeps the current month explicitly in progress", () => {
  const report = buildMonthlyCloseReport({
    contacts: [contact()],
    scope: "all",
    periodStart: JULY_START,
    now: new Date("2026-07-11T12:00:00.000Z"),
  });

  assert.equal(report.closeStatus, "IN_PROGRESS");
  assert.equal(report.period.isComplete, false);
  assert.match(report.headline, /Måneden pågår/);
});

test("compares actual results only with user-defined goals", () => {
  const report = buildMonthlyCloseReport({
    contacts: [contact({ commission_amount: 20_000 })],
    scope: "all",
    periodStart: JULY_START,
    goals: {
      commissionTargetEur: 40_000,
      closedDealsTarget: 2,
      keyholdingMrrTargetEur: null,
      keyholdingContractsTarget: null,
      recoveredLeadsTarget: null,
    },
    now: AFTER_JULY,
  });

  assert.equal(report.goals.find((item) => item.id === "commission")?.progressPercent, 50);
  assert.equal(report.goals.find((item) => item.id === "keyholding-mrr")?.status, "UNSET");
});
