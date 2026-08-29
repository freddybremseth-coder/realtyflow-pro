import assert from "node:assert/strict";
import test from "node:test";
import { buildArtifactVariantCandidates, canonicalCatalogSummary, canonicalEditionCoverage, groupReconciliationCandidates } from "./canonical-catalog";

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

test("artifact-labelled manuscripts point to the verified website work", () => {
  const candidates = buildArtifactVariantCandidates([
    { id: "project", canonical_title: "My Journey as a Father — Complete Manuscript v1.4 EPUB", status: "active", sourceLinks: [{ source_type: "publishing_book_project", verified: true }] },
    { id: "website", canonical_title: "My Journey as a Father", status: "active", sourceLinks: [{ source_type: "book_title", verified: true }] },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source_work_id, "project");
  assert.equal(candidates[0].target_work_id, "website");
  assert.deepEqual((candidates[0].evidence as Record<string, unknown>).requires_human_review, true);
});

test("same clean title is not emitted as an artifact candidate", () => {
  assert.deepEqual(buildArtifactVariantCandidates([
    { id: "one", canonical_title: "The Joy Code", status: "active" },
    { id: "two", canonical_title: "The Joy Code", status: "active" },
  ]), []);
});

test("Norwegian main-edition labels are revisions, not new book identities", () => {
  const candidates = buildArtifactVariantCandidates([
    { id: "revision", canonical_title: "Hvem eier virkeligheten ny hovedutgave v2 PDF", status: "active", sourceLinks: [{ source_type: "publishing_book_project", verified: true }] },
    { id: "catalog", canonical_title: "Hvem eier virkeligheten?", status: "active", sourceLinks: [{ source_type: "book_title", verified: true }] },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].target_work_id, "catalog");
});
