import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import { opportunityToStoreRow } from "@/lib/nexus-opportunity-store";

function opportunity(overrides: Partial<Parameters<typeof buildNexusBusinessOpportunity>[0]> = {}) {
  const value = buildNexusBusinessOpportunity({
    id: "revenue:contact-1",
    brandId: "zeneco",
    offerId: "villa-1",
    pipelineId: "real_estate_sales",
    stageId: "negotiation",
    title: "Buyer A",
    reason: "Pris diskuteres",
    priority: "CRITICAL",
    priorityScore: 95,
    value: 500000,
    currency: "EUR",
    sourceSystem: "revenue_today",
    sourceId: "contact-1",
    href: "/today",
    routeConfidence: "high",
    routeReason: "Explicit real estate source",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  });
  assert.ok(value);
  return value;
}

test("store projection preserves business-specific pipeline and stable source key", () => {
  const row = opportunityToStoreRow(opportunity(), { contactId: "11111111-1111-1111-1111-111111111111" });
  assert.equal(row.pipeline_id, "real_estate_sales");
  assert.equal(row.stage_id, "negotiation");
  assert.equal(row.source_system, "revenue_today");
  assert.equal(row.source_id, "contact-1");
  assert.equal(row.contact_id, "11111111-1111-1111-1111-111111111111");
});

test("terminal opportunity becomes won by default while nonterminal stays active", () => {
  const active = opportunityToStoreRow(opportunity());
  const completed = opportunityToStoreRow(opportunity({ stageId: "completed" }));
  assert.equal(active.opportunity_state, "active");
  assert.equal(completed.opportunity_state, "won");
});

test("explicit state can archive a source projection without changing pipeline semantics", () => {
  const row = opportunityToStoreRow(opportunity(), { state: "archived" });
  assert.equal(row.opportunity_state, "archived");
  assert.equal(row.pipeline_id, "real_estate_sales");
});

test("metadata keeps normalized audit context", () => {
  const row = opportunityToStoreRow(opportunity(), { metadata: { adapter_version: 1 } });
  assert.equal(row.metadata.adapter_version, 1);
  assert.equal(row.metadata.normalized_opportunity_id, "revenue:contact-1");
  assert.equal(row.metadata.stage_label, "Forhandling");
});
