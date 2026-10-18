import assert from "node:assert/strict";
import test from "node:test";
import { reviewProjectPage, type ProjectPageReviewInput } from "./visibility-project-page-review";

const base: ProjectPageReviewInput = {
  pageUrl: "https://www.zenecohomes.com/eiendommer/example",
  type: "development",
  directAnswer: "A development overview based on verified developer information.",
  authorName: "Editorial reviewer",
  faqCount: 2,
  nextStepUrl: "https://www.zenecohomes.com/booking",
  facts: ["price", "delivery", "energyClass", "taxes"].map(key => ({
    key: key as "price" | "delivery" | "energyClass" | "taxes",
    value: "Confirmed with primary documentation",
    sourceUrl: "https://example.org/source",
    checkedAt: "2026-10-18",
    verifiedByHuman: true,
  })),
};

test("complete evidence record remains read-only even after passing review", () => {
  const result = reviewProjectPage(base);
  assert.equal(result.status, "REVIEW_PASSED");
  assert.equal(result.canPublish, false);
  assert.equal(result.publicationEligible, false);
  assert.equal(result.checkedAutomatically, false);
});
test("fabricated-looking assertion without source and signoff is blocked", () => {
  const result = reviewProjectPage({
    ...base,
    facts: [{ key: "delivery", value: "4–6 months", verifiedByHuman: false }],
  });
  assert.equal(result.status, "REVIEW_BLOCKED");
  assert.ok(result.findings.some(f => f.code === "FACT_NOT_SOURCED"));
  assert.ok(result.findings.some(f => f.code === "FACT_NOT_HUMAN_VERIFIED"));
});
test("omitted information is a warning, not invented or called verified", () => {
  const result = reviewProjectPage({ ...base, facts: [], faqCount: 0 });
  assert.equal(result.status, "REVIEW_WARNINGS");
  assert.ok(result.findings.some(f => f.code === "CRITICAL_FACT_MISSING"));
  assert.equal(result.canPublish, false);
});
