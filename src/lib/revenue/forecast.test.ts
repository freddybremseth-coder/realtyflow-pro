import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_COMMISSION_PERCENT,
  STAGE_PROBABILITIES,
  buildForecastDeal,
  buildRevenueForecast,
  normalizeForecastStage,
} from "./forecast";

const NOW = new Date("2026-07-11T10:00:00.000Z");

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    name: "Test Customer",
    email: "customer@example.com",
    phone: "+34 600 000 000",
    pipeline_status: "QUALIFIED",
    pipeline_value: 500_000,
    commission_percent: 4,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-07-09T10:00:00.000Z",
    last_contact: "2026-07-09T10:00:00.000Z",
    next_followup: "2026-07-15T09:00:00.000Z",
    brand_id: "soleada",
    ...overrides,
  };
}

test("normalizes won, lost and localized statuses", () => {
  assert.equal(normalizeForecastStage("Vunnet"), "WON");
  assert.equal(normalizeForecastStage("Tapt"), "LOST");
  assert.equal(normalizeForecastStage("Forhandling"), "NEGOTIATION");
  assert.equal(normalizeForecastStage("På vent"), "ON_HOLD");
});

test("calculates weighted value and commission from stage probability", () => {
  const deal = buildForecastDeal(contact(), NOW);
  assert.ok(deal);
  assert.equal(deal.stage, "QUALIFIED");
  assert.equal(deal.dealValue, 500_000);
  assert.equal(deal.grossCommission, 20_000);
  assert.equal(deal.probability, STAGE_PROBABILITIES.QUALIFIED);
  assert.equal(deal.weightedValue, 150_000);
  assert.equal(deal.weightedCommission, 6_000);
  assert.equal(deal.commissionRateEstimated, false);
});

test("uses an explicit fallback commission assumption when rate is missing", () => {
  const deal = buildForecastDeal(contact({ commission_percent: null, commission_amount: null }), NOW);
  assert.ok(deal);
  assert.equal(deal.commissionRate, FALLBACK_COMMISSION_PERCENT);
  assert.equal(deal.commissionRateEstimated, true);
  assert.equal(deal.grossCommission, 15_000);
  assert.ok(deal.issues.some((issue) => issue.includes("3 %")));
});

test("marks overdue stale negotiation as high risk", () => {
  const deal = buildForecastDeal(contact({
    pipeline_status: "NEGOTIATION",
    last_contact: "2026-06-01T10:00:00.000Z",
    next_followup: "2026-07-01T09:00:00.000Z",
  }), NOW);
  assert.ok(deal);
  assert.equal(deal.overdue, true);
  assert.equal(deal.stale, true);
  assert.equal(deal.risk, "HIGH");
  assert.ok(deal.healthScore <= 45);
});

test("excludes won and lost contacts from active forecast deals", () => {
  assert.equal(buildForecastDeal(contact({ pipeline_status: "WON" }), NOW), null);
  assert.equal(buildForecastDeal(contact({ pipeline_status: "LOST" }), NOW), null);
});

test("builds won commission and unpaid commission totals", () => {
  const forecast = buildRevenueForecast([
    contact({ id: "active", pipeline_status: "VIEWING" }),
    contact({ id: "won-paid", pipeline_status: "WON", sale_price: 400_000, commission_percent: 5, commission_paid_date: "2026-07-01" }),
    contact({ id: "won-unpaid", pipeline_status: "SOLGT", commission_amount: 12_000, commission_paid_date: null }),
    contact({ id: "lost", pipeline_status: "LOST" }),
  ], NOW);

  assert.equal(forecast.summary.activeDeals, 1);
  assert.equal(forecast.summary.wonDeals, 2);
  assert.equal(forecast.summary.lostDeals, 1);
  assert.equal(forecast.summary.registeredOutcomeWinRate, 2 / 3);
  assert.equal(forecast.summary.wonCommission, 32_000);
  assert.equal(forecast.summary.unpaidWonCommission, 12_000);
});

test("scenario forecast is ordered conservative, base, upside", () => {
  const forecast = buildRevenueForecast([
    contact({ id: "qualified" }),
    contact({ id: "negotiation", pipeline_status: "NEGOTIATION", pipeline_value: 800_000, commission_percent: 3 }),
  ], NOW);

  assert.ok(forecast.scenarios.conservativeCommission < forecast.scenarios.baseCommission);
  assert.ok(forecast.scenarios.baseCommission < forecast.scenarios.upsideCommission);
  assert.equal(forecast.scenarios.baseCommission, forecast.summary.weightedCommission);
});

test("identifies bottleneck and sorts high-risk deals first", () => {
  const forecast = buildRevenueForecast([
    contact({ id: "healthy", name: "Healthy", pipeline_status: "VIEWING" }),
    contact({
      id: "blocked",
      name: "Blocked",
      pipeline_status: "NEGOTIATION",
      pipeline_value: null,
      email: null,
      phone: null,
      last_contact: "2026-05-01T10:00:00.000Z",
      next_followup: "2026-06-01T10:00:00.000Z",
    }),
  ], NOW);

  assert.equal(forecast.deals[0].id, "blocked");
  assert.equal(forecast.deals[0].risk, "HIGH");
  assert.equal(forecast.summary.bottleneckStage, "NEGOTIATION");
  assert.ok(forecast.summary.dataQualityScore < 100);
});
