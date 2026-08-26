import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import { buildNexusMissionPortfolio } from "@/lib/nexus-mission-portfolio";

function opp(input: Parameters<typeof buildNexusBusinessOpportunity>[0]) {
  const value = buildNexusBusinessOpportunity(input);
  assert.ok(value);
  return value;
}

test("mission portfolio keeps EUR and USD values separate", () => {
  const portfolio = buildNexusMissionPortfolio([
    opp({ id: "re-1", brandId: "zeneco", pipelineId: "real_estate_sales", stageId: "negotiation", title: "Villa buyer", priorityScore: 95, value: 500000, currency: "EUR", sourceSystem: "revenue_today", href: "/today", routeConfidence: "high" }),
    opp({ id: "book-1", brandId: "freddypublishing", pipelineId: "publishing", stageId: "purchased", title: "Book One", priorityScore: 72, value: 35, currency: "USD", sourceSystem: "book_growth", href: "/book-growth", routeConfidence: "high" }),
  ]);
  assert.equal(portfolio.valueByCurrency.EUR, 500000);
  assert.equal(portfolio.valueByCurrency.USD, 35);
  assert.equal(Object.keys(portfolio.valueByCurrency).length, 2);
});

test("mission portfolio preserves separate business pipeline counts", () => {
  const portfolio = buildNexusMissionPortfolio([
    opp({ id: "re-1", brandId: "zeneco", pipelineId: "real_estate_sales", stageId: "viewing", title: "Buyer", priorityScore: 85, sourceSystem: "revenue_today", href: "/today", routeConfidence: "high" }),
    opp({ id: "book-1", brandId: "freddypublishing", pipelineId: "publishing", stageId: "sample_engaged", title: "Reader intent", priorityScore: 65, sourceSystem: "book_growth", href: "/book-growth", routeConfidence: "high" }),
  ]);
  assert.equal(portfolio.byPipeline.real_estate_sales, 1);
  assert.equal(portfolio.byPipeline.publishing, 1);
});
