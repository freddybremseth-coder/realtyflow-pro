import assert from "node:assert/strict";
import { test } from "node:test";
import { bookGrowthPriorityToPublishingOpportunity, type BookGrowthPriorityInput } from "@/lib/nexus-publishing-opportunity-adapter";

function book(overrides: Partial<BookGrowthPriorityInput> = {}): BookGrowthPriorityInput {
  return {
    bookId: "book-1",
    slug: "book-one",
    title: "Book One",
    language: "en",
    seriesTitle: "Series One",
    seriesNumber: 1,
    hasAsin: true,
    pendingRecommendations: 1,
    score: 78,
    events30d: { bookViews: 30, sampleClicks: 0, amazonClicks: 0, directBuyClicks: 0 },
    economics90d: { royalties: 0, units: 0, orders: 0, pagesRead: 0, adSpend: 0, adSales: 0, currencies: ["USD"], monetarySafe: true },
    ...overrides,
  };
}

test("book views remain publishing discovery rather than becoming CRM leads", () => {
  const opportunity = bookGrowthPriorityToPublishingOpportunity(book());
  assert.ok(opportunity);
  assert.equal(opportunity.pipelineId, "publishing");
  assert.equal(opportunity.stageId, "discovered");
});

test("sample clicks map to sample engagement", () => {
  const opportunity = bookGrowthPriorityToPublishingOpportunity(book({ events30d: { bookViews: 30, sampleClicks: 8, amazonClicks: 0, directBuyClicks: 0 } }));
  assert.equal(opportunity?.stageId, "sample_engaged");
});

test("retailer clicks map to purchase intent", () => {
  const opportunity = bookGrowthPriorityToPublishingOpportunity(book({ events30d: { bookViews: 30, sampleClicks: 4, amazonClicks: 6, directBuyClicks: 1 } }));
  assert.equal(opportunity?.stageId, "purchase_intent");
});

test("actual units/orders map to purchased and preserve safe monetary value", () => {
  const opportunity = bookGrowthPriorityToPublishingOpportunity(book({ economics90d: { royalties: 44.5, units: 7, orders: 6, pagesRead: 1200, adSpend: 10, adSales: 30, currencies: ["USD"], monetarySafe: true } }));
  assert.equal(opportunity?.stageId, "purchased");
  assert.equal(opportunity?.value, 44.5);
  assert.equal(opportunity?.currency, "USD");
});

test("mixed currencies do not expose a misleading aggregate monetary value", () => {
  const opportunity = bookGrowthPriorityToPublishingOpportunity(book({ economics90d: { royalties: 100, units: 7, orders: 6, currencies: ["EUR", "USD"], monetarySafe: false } }));
  assert.equal(opportunity?.value, null);
  assert.equal(opportunity?.currency, null);
});
