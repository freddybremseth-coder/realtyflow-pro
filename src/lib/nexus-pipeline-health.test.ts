import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import { buildNexusPipelineHealth, isNexusOpportunityStale } from "@/lib/nexus-pipeline-health";

function opp(overrides: Partial<Parameters<typeof buildNexusBusinessOpportunity>[0]> = {}) {
  const value = buildNexusBusinessOpportunity({
    id: "opp-1",
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    stageId: "viewing",
    title: "Buyer",
    priorityScore: 80,
    sourceSystem: "test",
    href: "/today",
    routeConfidence: "high",
    updatedAt: "2026-08-25T12:00:00Z",
    ...overrides,
  });
  assert.ok(value);
  return value;
}

test("conversion becomes stale faster than consideration", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const viewing = opp({ stageId: "viewing", updatedAt: "2026-08-23T12:00:00Z" });
  const negotiation = opp({ id: "opp-2", stageId: "negotiation", updatedAt: "2026-08-23T12:00:00Z" });
  assert.equal(isNexusOpportunityStale(viewing, now), false);
  assert.equal(isNexusOpportunityStale(negotiation, now), true);
});

test("stale conversion makes pipeline health critical", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const health = buildNexusPipelineHealth([
    opp({ stageId: "negotiation", updatedAt: "2026-08-20T12:00:00Z", priorityScore: 95 }),
  ], now)[0];
  assert.equal(health?.health, "CRITICAL");
  assert.equal(health?.staleConversionOpportunities, 1);
});

test("missing timestamps are reported as unknown, not falsely stale", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const health = buildNexusPipelineHealth([
    opp({ brandId: "freddypublishing", pipelineId: "publishing", stageId: "sample_engaged", updatedAt: null }),
  ], now)[0];
  assert.equal(health?.staleOpportunities, 0);
  assert.equal(health?.unknownFreshness, 1);
});

test("visible values remain separated by currency", () => {
  const health = buildNexusPipelineHealth([
    opp({ value: 500000, currency: "EUR" }),
    opp({ id: "opp-2", value: 15000, currency: "EUR" }),
  ])[0];
  assert.equal(health?.visibleValueByCurrency.EUR, 515000);
});
