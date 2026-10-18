import assert from "node:assert/strict";
import test from "node:test";
import { projectReviewCandidates } from "./visibility-project-review-candidates";
import type { SiteAudit } from "./seo-audit";

function audit(brandId: string): SiteAudit {
  return {
    brandId, base: "https://www.zenecohomes.com", checkedAt: "2026-10-18T18:00:00Z",
    home: {status: 200, finalUrl: null, title: null, description: null, canonical: null, h1Count: 1, xRobots: null, robotsMeta: null, jsonLdCount: null, jsonLdParseErrors: null},
    robots: {status: 200, sitemapDeclared: true, googlebotBlocked: false},
    sitemap: {status: 200, urlCountSample: 3, xmlLike: true},
    observations: [], limitations: [],
    samples: [
      {path: "/eiendommer/N6299", status: 200, titlePresent: true, descriptionPresent: true, canonical: null, h1Count: 1, noindex: false, issue: null},
      {path: "/guide/kjope-bolig", status: 200, titlePresent: true, descriptionPresent: true, canonical: null, h1Count: 1, noindex: false, issue: null},
      {path: "/eiendommer/N6300", status: null, titlePresent: null, descriptionPresent: null, canonical: null, h1Count: null, noindex: null, issue: null},
    ],
  };
}
test("Sam candidates are only sampled project URLs and remain unreviewed", () => {
  const candidates = projectReviewCandidates(audit("zeneco"));
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].status, "NOT_REVIEWED");
  assert.equal(candidates[0].factsVerified, false);
  assert.equal(candidates[0].publicationEligible, false);
  assert.equal(candidates[1].hasHttpEvidence, false);
});
test("other brands never receive Zen Eco Homes project candidate classification", () => {
  assert.deepEqual(projectReviewCandidates(audit("donaanna")), []);
});
