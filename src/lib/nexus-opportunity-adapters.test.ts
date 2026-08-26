import assert from "node:assert/strict";
import { test } from "node:test";
import { revenuePriorityToRealEstateOpportunity } from "@/lib/nexus-opportunity-adapters";
import type { RevenuePriorityItem } from "@/lib/revenue/today";

function priority(overrides: Partial<RevenuePriorityItem> = {}): RevenuePriorityItem {
  return {
    id: "lead-1",
    contactName: "Test Buyer",
    email: "buyer@example.com",
    phone: null,
    brandId: "zeneco",
    source: "website",
    stage: "VIEWING",
    value: 450000,
    propertyInterest: "Villa 12",
    kind: "closing",
    priority: "HIGH",
    score: 86,
    reason: "Visning er booket.",
    recommendedAction: "Bekreft visning og avklar beslutningshindre.",
    lastContactAt: "2026-08-26T10:00:00Z",
    nextFollowupAt: "2026-08-27T10:00:00Z",
    createdAt: "2026-08-20T10:00:00Z",
    isOverdue: false,
    isMissingNextAction: false,
    href: "/customers?contactId=lead-1",
    ...overrides,
  };
}

test("Revenue Today viewing maps explicitly to real-estate viewing", () => {
  const opportunity = revenuePriorityToRealEstateOpportunity(priority());
  assert.ok(opportunity);
  assert.equal(opportunity.pipelineId, "real_estate_sales");
  assert.equal(opportunity.stageId, "viewing");
  assert.equal(opportunity.routeConfidence, "high");
});

test("Revenue Today negotiation maps to a closing-stage real-estate opportunity", () => {
  const opportunity = revenuePriorityToRealEstateOpportunity(priority({ stage: "NEGOTIATION", priority: "CRITICAL", score: 95 }));
  assert.ok(opportunity);
  assert.equal(opportunity.stageId, "negotiation");
  assert.equal(opportunity.phase, "conversion");
  assert.equal(opportunity.priority, "CRITICAL");
});

test("Revenue Today never leaks property stages into another business pipeline", () => {
  const opportunity = revenuePriorityToRealEstateOpportunity(priority({ stage: "QUALIFIED" }));
  assert.equal(opportunity?.pipelineId, "real_estate_sales");
  assert.equal(opportunity?.stageId, "qualified_buyer");
});
