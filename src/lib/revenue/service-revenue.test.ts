import test from "node:test";
import assert from "node:assert/strict";
import {
  buildServiceRevenueAccount,
  buildServiceRevenueWorkspace,
  recommendKeyholdingPlan,
  sortServiceRevenueAccounts,
} from "./service-revenue";

const NOW = new Date("2026-07-11T12:00:00.000Z");

function won(overrides: Record<string, unknown> = {}) {
  return {
    id: "customer-1",
    name: "Kunde",
    pipeline_status: "WON",
    brand_id: "soleada",
    sale_price: 500_000,
    won_at: "2026-06-01T10:00:00.000Z",
    email: "kunde@example.com",
    interactions: [],
    ...overrides,
  };
}

function event(action: string, date: string, metadata: Record<string, unknown> = {}) {
  return { action, date, metadata };
}

test("excludes unrelated contacts that are not won and have no service signal", () => {
  assert.equal(buildServiceRevenueAccount({ id: "lead", pipeline_status: "NEW" }, NOW), null);
});

test("recommends Basic for apartments", () => {
  assert.equal(recommendKeyholdingPlan(won({ property_interest: "Leilighet i Albir" })), "BASIC");
  const account = buildServiceRevenueAccount(won({ property_interest: "Leilighet i Albir" }), NOW);
  assert.equal(account?.lifecycle, "PROSPECT");
  assert.equal(account?.potentialMonthlyRevenue, 55);
});

test("recommends Standard for normal villas", () => {
  const account = buildServiceRevenueAccount(won({ property_interest: "Villa i Altea" }), NOW);
  assert.equal(account?.recommendedPlan, "STANDARD");
  assert.equal(account?.potentialAnnualRevenue, 1_068);
});

test("recommends Premium for rentals and large villas", () => {
  assert.equal(recommendKeyholdingPlan(won({ notes: "Stor villa med Airbnb-utleie" })), "PREMIUM");
});

test("recognizes an offered service without counting recurring revenue", () => {
  const account = buildServiceRevenueAccount(won({
    interactions: [event("keyholding_offer_made", "2026-07-01T10:00:00.000Z", { plan: "STANDARD" })],
  }), NOW);
  assert.equal(account?.lifecycle, "OFFERED");
  assert.equal(account?.currentPlan, "STANDARD");
  assert.equal(account?.monthlyRevenue, 0);
});

test("counts active contract revenue from the registered plan", () => {
  const account = buildServiceRevenueAccount(won({
    interactions: [event("keyholding_contract_started", "2026-05-01T10:00:00.000Z", {
      plan: "PREMIUM",
      renewal_at: "2027-05-01T10:00:00.000Z",
    })],
  }), NOW);
  assert.equal(account?.lifecycle, "ACTIVE");
  assert.equal(account?.currentPlan, "PREMIUM");
  assert.equal(account?.monthlyRevenue, 169);
  assert.equal(account?.annualRevenue, 2_028);
});

test("marks active contracts as renewal due within 30 days", () => {
  const account = buildServiceRevenueAccount(won({
    interactions: [event("keyholding_contract_started", "2025-07-20T10:00:00.000Z", {
      plan: "BASIC",
      renewal_at: "2026-07-20T10:00:00.000Z",
    })],
  }), NOW);
  assert.equal(account?.lifecycle, "RENEWAL_DUE");
  assert.equal(account?.renewalDue, true);
  assert.equal(account?.priority, "HIGH");
});

test("cancelled contracts do not count active or potential revenue", () => {
  const account = buildServiceRevenueAccount(won({
    interactions: [
      event("keyholding_contract_cancelled", "2026-07-01T10:00:00.000Z"),
      event("keyholding_contract_started", "2026-01-01T10:00:00.000Z", { plan: "STANDARD" }),
    ],
  }), NOW);
  assert.equal(account?.lifecycle, "CANCELLED");
  assert.equal(account?.monthlyRevenue, 0);
  assert.equal(account?.potentialMonthlyRevenue, 0);
});

test("workspace separates actual recurring revenue from potential revenue", () => {
  const result = buildServiceRevenueWorkspace([
    won({ id: "prospect", property_interest: "Leilighet i Albir" }),
    won({
      id: "active",
      interactions: [event("keyholding_contract_started", "2026-01-01T10:00:00.000Z", {
        plan: "STANDARD",
        renewal_at: "2027-01-01T10:00:00.000Z",
      })],
    }),
    won({
      id: "offered",
      notes: "Stor villa med utleie",
      interactions: [event("keyholding_offer_made", "2026-07-01T10:00:00.000Z", { plan: "PREMIUM" })],
    }),
  ], NOW);

  assert.equal(result.summary.activeContracts, 1);
  assert.equal(result.summary.monthlyRecurringRevenue, 89);
  assert.equal(result.summary.annualRecurringRevenue, 1_068);
  assert.equal(result.summary.potentialMonthlyRevenue, 224);
  assert.equal(result.summary.potentialAnnualRevenue, 2_688);
});

test("sorts renewal and overdue accounts before ordinary prospects", () => {
  const renewal = buildServiceRevenueAccount(won({
    id: "renewal",
    interactions: [event("keyholding_contract_started", "2025-07-20T10:00:00.000Z", {
      plan: "STANDARD",
      renewal_at: "2026-07-20T10:00:00.000Z",
    })],
  }), NOW)!;
  const prospect = buildServiceRevenueAccount(won({ id: "prospect" }), NOW)!;
  assert.deepEqual(sortServiceRevenueAccounts([prospect, renewal]).map((item) => item.id), ["renewal", "prospect"]);
});
