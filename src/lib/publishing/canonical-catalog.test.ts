import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCatalogSummary, canonicalEditionCoverage, groupReconciliationCandidates } from "./canonical-catalog";

const edition = { id: "e1", work_id: "w1", edition_key: "en-ebook", title: "Book", language: "en", format: "ebook", status: "published" };

test("catalogue coverage requires the exact canonical revision and assets", () => {
  const rows = canonicalEditionCoverage(
    [edition],
    [{ id: "r1", edition_id: "e1", status: "approved", is_canonical: true }],
    [
      { id: "a1", edition_id: "e1", asset_type: "epub", status: "verified", is_canonical: true },
      { id: "a2", edition_id: "e1", asset_type: "cover", status: "verified", is_canonical: true },
      { id: "a3", edition_id: "e1", asset_type: "sample", status: "verified", is_canonical: true },
    ],
    [{ id: "i1", edition_id: "e1", scheme: "asin", verified: true }],
    [{ id: "p1", edition_id: "e1", revision_id: "r1", status: "published" }],
  );
  assert.equal(rows[0].score, 100);
  assert.deepEqual(rows[0].issues, []);
});

test("candidate files never count as canonical catalogue assets", () => {
  const rows = canonicalEditionCoverage(
    [edition],
    [],
    [{ id: "a1", edition_id: "e1", asset_type: "epub", status: "candidate", is_canonical: false }],
    [],
    [],
  );
  assert.ok(rows[0].issues.includes("missing_canonical_revision"));
  assert.ok(rows[0].issues.includes("missing_epub"));
  assert.ok(rows[0].issues.includes("missing_publication_link"));
});

test("catalogue summary keeps pending and approved merges separate", () => {
  const summary = canonicalCatalogSummary({
    works: [{ status: "active" }, { status: "archived" }],
    editions: [edition],
    revisions: [], assets: [], identifiers: [], publications: [],
    sourceLinks: [{ verified: true }, { verified: false }],
    candidates: [{ status: "pending" }, { status: "approved" }],
  });
  assert.equal(summary.works, 1);
  assert.equal(summary.archivedWorks, 1);
  assert.equal(summary.pendingMerges, 1);
  assert.equal(summary.approvedMerges, 1);
  assert.equal(summary.verifiedSourceLinks, 1);
});

test("reconciliation candidates with the same title become one review group", () => {
  const candidates = [
    { id: "c1", source_work_id: "w1", target_work_id: "w2", candidate_type: "merge_works", confidence: 0.95, status: "pending", evidence: { title: "The Book" } },
    { id: "c2", source_work_id: "w3", target_work_id: "w2", candidate_type: "merge_works", confidence: 0.95, status: "approved", evidence: { title: "  the   book " } },
  ];
  const groups = groupReconciliationCandidates(candidates);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].workCount, 3);
  assert.equal(groups[0].pendingCount, 1);
  assert.equal(groups[0].approvedCount, 1);
});
