import assert from "node:assert/strict";
import { test } from "node:test";
import { contactIdForOpportunity, normalizeOpportunitySourcePayloads } from "@/lib/nexus-opportunity-sync";
import { buildNexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";

test("normalizes three source payloads without mixing business semantics", () => {
  const batches = normalizeOpportunitySourcePayloads({
    revenue: { priorities: [{ id: "11111111-1111-4111-8111-111111111111", contactName: "Buyer", email: null, phone: null, brandId: "zeneco", source: "web", stage: "NEGOTIATION", value: 500000, propertyInterest: "Villa", kind: "closing", priority: "CRITICAL", score: 95, reason: "Forhandling", recommendedAction: "Følg opp", lastContactAt: null, nextFollowupAt: null, createdAt: null, isOverdue: false, isMissingNextAction: false, href: "/customers" }] },
    books: { priority: [{ bookId: "book-1", slug: "book", title: "Book", score: 70, events30d: { bookViews: 5, sampleClicks: 1, amazonClicks: 0, directBuyClicks: 0 } }] },
    demosites: { orders: [{ id: "demo-1", status: "preview_ready", company_name: "ACME" }], events: [] },
  });

  assert.equal(batches.length, 3);
  assert.equal(batches[0]?.opportunities[0]?.pipelineId, "real_estate_sales");
  assert.equal(batches[1]?.opportunities[0]?.pipelineId, "publishing");
  assert.equal(batches[2]?.opportunities[0]?.pipelineId, "ai_products_services");
});

test("only verified revenue UUID source IDs become contact links", () => {
  const valid = buildNexusBusinessOpportunity({ id: "x", brandId: "zeneco", pipelineId: "real_estate_sales", stageId: "new_lead", title: "A", sourceSystem: "revenue_today", sourceId: "11111111-1111-4111-8111-111111111111", href: "/today" });
  const invalid = buildNexusBusinessOpportunity({ id: "y", brandId: "zeneco", pipelineId: "real_estate_sales", stageId: "new_lead", title: "B", sourceSystem: "revenue_today", sourceId: "contact-not-uuid", href: "/today" });
  assert.ok(valid && invalid);
  assert.equal(contactIdForOpportunity(valid), "11111111-1111-4111-8111-111111111111");
  assert.equal(contactIdForOpportunity(invalid), null);
});
