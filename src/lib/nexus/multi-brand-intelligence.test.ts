import assert from "node:assert/strict";
import test from "node:test";
import { buildMultiBrandIntelligence, type MultiBrandIntelligenceInput, type MultiBrandSignal } from "./multi-brand-intelligence";

const brand = (overrides: Partial<MultiBrandSignal>): MultiBrandSignal => ({
  brandId: "zeneco",
  brandName: "Zen Eco Homes",
  kind: "real_estate",
  plannedChannels: ["instagram", "facebook"],
  contentPillars: ["property_showcase"],
  active: true,
  growthStage: "PROVE",
  connectedChannels: 2,
  readySources: 4,
  blockedSources: 0,
  quarantined: 0,
  actionableRules: 3,
  leads: 8,
  qualified: 3,
  sales: 1,
  commissionEur: 12000,
  attributionCoveragePercent: 90,
  ...overrides,
});

function input(): MultiBrandIntelligenceInput {
  return {
    generatedAt: "2026-09-14T16:00:00.000Z",
    brands: [
      brand({}),
      brand({ brandId: "pinosoecolife", brandName: "Pinoso EcoLife", growthStage: "PILOT", actionableRules: 0, leads: 1, qualified: 0, sales: 0 }),
      brand({ brandId: "chatgenius", brandName: "ChatGenius.pro", kind: "saas", contentPillars: ["product_demo"], growthStage: "FOUNDATION", actionableRules: 0, leads: 0, qualified: 0, sales: 0 }),
    ],
    revenue: [
      { brandId: "pinosoecolife", focus: "CASH_NOW", readiness: "HUMAN_DECISION", opportunityScore: 96, expectedValue: 340000 },
      { brandId: "zeneco", focus: "PIPELINE_NEXT", readiness: "READY_TO_PREPARE", opportunityScore: 72, expectedValue: 120000 },
    ],
  };
}

test("portfolio focus uses aggregate Revenue Brain impact without exposing opportunity rows", () => {
  const result = buildMultiBrandIntelligence(input());
  assert.equal(result.brands[0]?.brandId, "pinosoecolife");
  assert.equal(result.brands[0]?.focus, "ADVANCE");
  assert.equal(result.brands[0]?.revenue.cashNow, 1);
  assert.equal(result.safety.customerDataSharedAcrossBrands, false);
  assert.doesNotMatch(JSON.stringify(result), /contactId|opportunityId|title/);
});

test("transfer candidates stay within related brands and require human aggregate-only review", () => {
  const result = buildMultiBrandIntelligence(input());
  assert.deepEqual(result.transferReviews.map((row) => [row.sourceBrandId, row.targetBrandId]), [["zeneco", "pinosoecolife"]]);
  assert.equal(result.transferReviews[0]?.automaticTransferAllowed, false);
  assert.equal(result.transferReviews[0]?.requiresHumanReview, true);
  assert.equal(result.transferReviews.some((row) => row.targetBrandId === "chatgenius"), false);
});

test("unknown brand revenue is ignored and quarantined evidence forces intervention", () => {
  const value = input();
  value.brands[0] = brand({ quarantined: 1 });
  value.revenue.push({ brandId: "unknown", focus: "CASH_NOW", readiness: "READY_TO_PREPARE", opportunityScore: 100, expectedValue: 999999 });
  const result = buildMultiBrandIntelligence(value);
  assert.equal(result.brands.find((row) => row.brandId === "zeneco")?.focus, "INTERVENE");
  assert.equal(result.summary.ignoredRevenueSignals, 1);
  assert.equal(result.summary.representedValue, 460000);
});
