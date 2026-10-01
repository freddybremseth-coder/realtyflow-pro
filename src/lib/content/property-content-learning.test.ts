import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePropertyContentLearning,
  normalizeTrackedPath,
  propertyContentEvidenceLevel,
} from "./property-content-learning";

test("normalizes full and relative article URLs without query strings", () => {
  assert.equal(
    normalizeTrackedPath("https://www.zenecohomes.com/magasin/example?utm_source=google"),
    "/magasin/example",
  );
  assert.equal(normalizeTrackedPath("/magasin/example/"), "/magasin/example");
});

test("lead evidence outranks traffic-only evidence", () => {
  assert.equal(propertyContentEvidenceLevel({ searchArrivals: 1, leadTouchpoints: 1 }), "measured");
  assert.equal(propertyContentEvidenceLevel({ searchArrivals: 5 }), "measured");
  assert.equal(propertyContentEvidenceLevel({ searchArrivals: 1 }), "emerging");
  assert.equal(propertyContentEvidenceLevel({}), "insufficient");
});

test("learning summary keeps only the latest snapshot per opportunity and remains review-gated", () => {
  const result = aggregatePropertyContentLearning([
    {
      opportunity_id: "a",
      opportunity_type: "same_price_area_gap",
      search_arrivals: 2,
      observed_at: "2026-09-20T00:00:00Z",
    },
    {
      opportunity_id: "a",
      opportunity_type: "same_price_area_gap",
      search_arrivals: 7,
      observed_at: "2026-09-21T00:00:00Z",
    },
    {
      opportunity_id: "b",
      opportunity_type: "same_price_area_gap",
      search_arrivals: 5,
      observed_at: "2026-09-21T00:00:00Z",
    },
  ]);

  assert.equal(result.mode, "observe_only");
  assert.equal(result.observedArticles, 2);
  assert.equal(result.totals.searchArrivals, 12);
  assert.equal(result.readyForReview, false);
  assert.equal(result.types[0]?.readyForReview, false);
});


test("learning applies advisory priority only after repeated measured evidence", () => {
  const result = aggregatePropertyContentLearning([
    { opportunity_id:"a1", opportunity_type:"budget_band_cluster", search_arrivals:6, lead_touchpoints:1, observed_at:"2026-09-29T10:00:00Z" },
    { opportunity_id:"a2", opportunity_type:"budget_band_cluster", search_arrivals:6, lead_touchpoints:1, observed_at:"2026-09-29T10:01:00Z" },
    { opportunity_id:"a3", opportunity_type:"budget_band_cluster", search_arrivals:6, observed_at:"2026-09-29T10:02:00Z" },
    { opportunity_id:"b1", opportunity_type:"same_price_area_gap", search_arrivals:1, observed_at:"2026-09-29T10:03:00Z" },
  ]);
  assert.equal(result.mode, "advisory_priority");
  assert.equal(result.recommendedOpportunityType, "budget_band_cluster");
  assert.equal(result.types.find(item => item.opportunityType === "budget_band_cluster")?.readyForReview, true);
  assert.ok((result.types.find(item => item.opportunityType === "budget_band_cluster")?.advisoryScore || 0) > 0);
});
