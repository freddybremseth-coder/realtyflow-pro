import assert from "node:assert/strict";
import test from "node:test";
import { inferBookKind, qualityTaxonomyReadiness, requiredQualityChecks } from "./quality-taxonomy";

test("book kind inference keeps fiction and nonfiction quality gates distinct", () => {
  assert.equal(inferBookKind("Psychological Thriller"), "fiction");
  assert.equal(inferBookKind("Personal finance and central banks"), "nonfiction");
});

test("nonfiction requires factual and citation evidence in addition to common gates", () => {
  assert.deepEqual(requiredQualityChecks("nonfiction"), [
    "canon_consistency", "editorial", "factual", "citations", "epub_validation", "accessibility", "metadata",
  ]);
  assert.equal(requiredQualityChecks("fiction").includes("factual" as never), false);
});

test("a series edition is not ready without approved series bible and work canon", () => {
  const result = qualityTaxonomyReadiness({ kind: "fiction", seriesBook: true, bibles: [], checks: [], taxonomy: [] });
  assert.deepEqual(result.missingBibles, ["series_bible", "work_canon"]);
  assert.equal(result.ready, false);
});

test("latest review attempt controls readiness and AI editorial pass still needs a decision", () => {
  const result = qualityTaxonomyReadiness({
    kind: "fiction",
    seriesBook: false,
    bibles: [{ bible_type: "work_canon", version: 1, status: "approved" }],
    checks: [
      { check_type: "canon_consistency", attempt: 1, result: "pass", decision: "approved" },
      { check_type: "editorial", attempt: 1, result: "pass", decision: "approved" },
      { check_type: "editorial", attempt: 2, result: "pass", decision: "pending" },
      { check_type: "epub_validation", attempt: 1, result: "pass", decision: "pending" },
      { check_type: "accessibility", attempt: 1, result: "pass", decision: "pending" },
      { check_type: "metadata", attempt: 1, result: "pass", decision: "approved" },
    ],
    taxonomy: [
      { assignment_type: "category", status: "approved", code: "FIC000000" },
      ...[1, 2, 3, 4, 5].map((n) => ({ assignment_type: "keyword" as const, status: "approved", code: `keyword-${n}` })),
    ],
  });
  assert.deepEqual(result.missingChecks, ["editorial"]);
  assert.equal(result.ready, false);
});

test("approved evidence and five to seven controlled keywords make a revision ready", () => {
  const checks = ["canon_consistency", "editorial", "metadata", "factual", "citations"].map((check_type) => ({
    check_type, attempt: 1, result: "pass", decision: "approved",
  })).concat([
    { check_type: "epub_validation", attempt: 1, result: "pass", decision: "pending" },
    { check_type: "accessibility", attempt: 1, result: "pass", decision: "pending" },
  ]);
  const result = qualityTaxonomyReadiness({
    kind: "nonfiction",
    seriesBook: false,
    bibles: [{ bible_type: "work_canon", version: 1, status: "approved" }],
    checks,
    taxonomy: [
      { assignment_type: "category", status: "approved", code: "BUS000000" },
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ assignment_type: "keyword" as const, status: "approved", code: `term-${n}` })),
    ],
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.taxonomyIssues, []);
});
