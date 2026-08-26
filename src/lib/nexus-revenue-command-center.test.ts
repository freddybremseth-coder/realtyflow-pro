import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";

function row(overrides: Partial<NexusOpportunityStoreRow> = {}): NexusOpportunityStoreRow {
  return {
    contact_id: null,
    brand_id: "zeneco",
    offer_id: null,
    pipeline_id: "real_estate_sales",
    stage_id: "negotiation",
    lifecycle_phase: "conversion",
    opportunity_state: "active",
    title: "Buyer A",
    reason: "Forhandling",
    next_action: "Avklar neste steg",
    priority: "CRITICAL",
    priority_score: 95,
    value: 500000,
    currency: "EUR",
    route_confidence: "high",
    route_reason: "Revenue Today",
    source_system: "revenue_today",
    source_id: "contact-1",
    source_updated_at: "2026-08-20T10:00:00Z",
    last_activity_at: "2026-08-20T10:00:00Z",
    metadata: { href: "/today", normalized_opportunity_id: "revenue:contact-1" },
    ...overrides,
  };
}

const now = new Date("2026-08-26T20:00:00Z");

test("stale conversion becomes critical pipeline and director closing mission", () => {
  const result = buildNexusRevenueCommandCenter([row()], now);
  assert.equal(result.summary.criticalPipelines, 1);
  assert.equal(result.summary.staleConversionOpportunities, 1);
  assert.equal(result.directorMissions[0]?.role, "closer");
  assert.equal(result.directorMissions[0]?.priority, "CRITICAL");
});

test("closing growth mission remains human-required through agentic policy", () => {
  const result = buildNexusRevenueCommandCenter([row()], now);
  const closingPlan = result.agenticPlans.find((plan) => plan.actionClass === "offer_response");
  assert.ok(closingPlan);
  assert.equal(closingPlan.effectiveMode, "human-required");
  assert.equal(closingPlan.externalSideEffectAllowed, false);
});

test("recent won opportunity remains visible for customer success followup", () => {
  const result = buildNexusRevenueCommandCenter([
    row({
      pipeline_id: "ai_products_services",
      brand_id: "chatgenius",
      stage_id: "won",
      lifecycle_phase: "delivery",
      opportunity_state: "won",
      source_system: "chatgenius_demosites",
      source_id: "demo-1",
      last_activity_at: "2026-08-25T10:00:00Z",
      source_updated_at: "2026-08-25T10:00:00Z",
      metadata: { href: "/saas?tab=demosites" },
    }),
  ], now);
  assert.equal(result.summary.activeOpportunities, 0);
  assert.equal(result.summary.recentWonFollowups, 1);
  assert.equal(result.growthMissions[0]?.role, "customer_success");
});

test("old won opportunity does not create indefinite customer success work", () => {
  const result = buildNexusRevenueCommandCenter([
    row({
      pipeline_id: "real_estate_sales",
      stage_id: "completed",
      lifecycle_phase: "retention",
      opportunity_state: "won",
      last_activity_at: "2026-06-01T10:00:00Z",
      source_updated_at: "2026-06-01T10:00:00Z",
    }),
  ], now);
  assert.equal(result.summary.recentWonFollowups, 0);
  assert.equal(result.growthMissions.length, 0);
});

test("visible values remain separated by currency", () => {
  const result = buildNexusRevenueCommandCenter([
    row({ value: 500000, currency: "EUR" }),
    row({ source_system: "book_growth", source_id: "book-1", pipeline_id: "publishing", brand_id: "freddypublishing", stage_id: "purchase_intent", lifecycle_phase: "consideration", value: 42, currency: "USD" }),
  ], now);
  assert.equal(result.summary.valueByCurrency.EUR, 500000);
  assert.equal(result.summary.valueByCurrency.USD, 42);
});
