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
  assert.equal(propertyContentEvidenceLevel({ searchArrivals: 1, leadTouchpoints: 1 }), "lead_signal");
  assert.equal(propertyContentEvidenceLevel({ searchArrivals: 5 }), "measured");
  assert.equal(propertyContentEvidenceLevel({ searchArrivals: 1 }), "early");
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
