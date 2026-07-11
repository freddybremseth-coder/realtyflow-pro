import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRevenueGoalScorecard,
  emptyRevenueGoalConfig,
  revenueGoalStorageKey,
  type RevenueGoalConfig,
} from "./goals";

const now = new Date("2026-07-11T12:00:00.000Z");

function config(scope: RevenueGoalConfig["scope"] = "soleada"): RevenueGoalConfig {
  return {
    scope,
    periodStart: "2026-07-01",
    commissionTargetEur: 40_000,
    closedDealsTarget: 2,
    keyholdingMrrTargetEur: 200,
    keyholdingContractsTarget: 2,
    recoveredLeadsTarget: 2,
    notes: "Kontrollert juli-plan",
    updatedAt: "2026-07-01T09:00:00.000Z",
  };
}

const contacts = [
  {
    id: "soleada-sale",
    name: "Soleada Buyer",
    brand_id: "soleada",
    pipeline_status: "WON",
    pipeline_value: 500_000,
    commission_percent: 4,
    won_at: "2026-07-05T10:00:00.000Z",
    commission_paid_date: "2026-07-06T10:00:00.000Z",
    email: "buyer@example.com",
    interactions: [
      {
        action: "keyholding_contract_started",
        date: "2026-07-08T10:00:00.000Z",
        metadata: { plan: "STANDARD", renewal_at: "2027-07-08T10:00:00.000Z" },
      },
    ],
  },
  {
    id: "soleada-negotiation",
    name: "Negotiation Buyer",
    brand_id: "soleada",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 500_000,
    commission_percent: 4,
    next_followup: "2026-07-12T09:00:00.000Z",
    email: "negotiation@example.com",
    notes: "Budsjett, område, tidslinje, begge beslutningstakere, favoritt, advokat, finansiering og reservasjon avklart",
  },
  {
    id: "soleada-recovery",
    name: "Recovered Lead",
    brand_id: "soleada",
    pipeline_status: "CONTACT",
    next_followup: "2026-07-14T09:00:00.000Z",
    phone: "+34123456789",
    interactions: [
      {
        action: "recovery_reactivated",
        date: "2026-07-07T10:00:00.000Z",
        metadata: { previous_stage: "LOST", target_stage: "CONTACT" },
      },
    ],
  },
  {
    id: "pinoso-sale",
    name: "Pinoso Buyer",
    brand_id: "pinosoecolife",
    pipeline_status: "WON",
    pipeline_value: 300_000,
    commission_percent: 6,
    won_at: "2026-07-04T10:00:00.000Z",
    email: "pinoso@example.com",
  },
];

test("empty goals remain explicitly unset without invented targets", () => {
  const scorecard = buildRevenueGoalScorecard({
    contacts,
    config: emptyRevenueGoalConfig("soleada", "2026-07"),
  }, now);

  assert.equal(scorecard.configured, false);
  assert.ok(scorecard.metrics.every((metric) => metric.target === null));
  assert.ok(scorecard.metrics.every((metric) => metric.status === "UNSET"));
  assert.match(scorecard.headline, /Sett månedens mål/);
});

test("scorecard separates earned, collected and forecast commission", () => {
  const scorecard = buildRevenueGoalScorecard({ contacts, config: config() }, now);
  const commission = scorecard.metrics.find((metric) => metric.id === "commission");

  assert.equal(scorecard.summary.earnedCommission, 20_000);
  assert.equal(scorecard.summary.collectedCommission, 20_000);
  assert.equal(scorecard.summary.forecast30Commission, 14_000);
  assert.equal(commission?.actual, 20_000);
  assert.equal(commission?.projected, 34_000);
});

test("Keyholding actual revenue only counts active contracts", () => {
  const scorecard = buildRevenueGoalScorecard({ contacts, config: config() }, now);

  assert.equal(scorecard.summary.currentKeyholdingMrr, 89);
  assert.equal(scorecard.summary.currentKeyholdingArr, 1_068);
  assert.equal(scorecard.summary.newKeyholdingContracts, 1);
  assert.equal(scorecard.metrics.find((metric) => metric.id === "keyholding-mrr")?.actual, 89);
});

test("reactivated leads are counted only from explicit recovery lifecycle events", () => {
  const scorecard = buildRevenueGoalScorecard({ contacts, config: config() }, now);

  assert.equal(scorecard.summary.recoveredLeads, 1);
  assert.equal(scorecard.metrics.find((metric) => metric.id === "recovery")?.actual, 1);
  assert.ok(scorecard.assumptions.some((item) => item.includes("recovery_reactivated")));
});

test("brand scope excludes results from other real-estate brands", () => {
  const soleada = buildRevenueGoalScorecard({ contacts, config: config("soleada") }, now);
  const pinoso = buildRevenueGoalScorecard({ contacts, config: config("pinosoecolife") }, now);

  assert.equal(soleada.summary.wonDeals, 1);
  assert.equal(soleada.summary.earnedCommission, 20_000);
  assert.equal(pinoso.summary.wonDeals, 1);
  assert.equal(pinoso.summary.earnedCommission, 18_000);
  assert.equal(pinoso.summary.currentKeyholdingMrr, 0);
});

test("weekly plan converts remaining gaps into visible weekly pace", () => {
  const scorecard = buildRevenueGoalScorecard({ contacts, config: config() }, now);
  const commissionPlan = scorecard.weeklyPlan.find((item) => item.id === "commission-pace");
  const mrrPlan = scorecard.weeklyPlan.find((item) => item.id === "mrr-pace");

  assert.ok(commissionPlan);
  assert.equal(commissionPlan?.unit, "EUR");
  assert.ok((commissionPlan?.targetThisWeek || 0) > 0);
  assert.ok(mrrPlan);
  assert.equal(mrrPlan?.unit, "COUNT");
});

test("storage keys isolate month and scope", () => {
  assert.equal(revenueGoalStorageKey("soleada", "2026-07-01"), "revenue-goals:soleada:2026-07");
  assert.equal(revenueGoalStorageKey("all", "2026-08-01"), "revenue-goals:all:2026-08");
});
