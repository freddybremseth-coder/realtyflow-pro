import assert from "node:assert/strict";
import test from "node:test";
import {
  groupBookProjects,
  isDistributionReady,
  normalizeBookIdentityTitle,
  publicationApproval,
  verifiedAmazonProjectIds,
} from "./book-workflow";

test("artifact labels do not create separate book identities", () => {
  assert.equal(normalizeBookIdentityTitle("My Journey as a Father — Complete Manuscript v1.4 EPUB"), "my journey as a father");
  const groups = groupBookProjects([
    { id: "a", title: "My Journey as a Father", updated_at: "2026-01-01" },
    { id: "b", title: "My Journey as a Father — FINAL export", updated_at: "2026-01-02" },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].editions.length, 2);
});

test("same title with different subtitles remains separate books", () => {
  const groups = groupBookProjects([
    { id: "a", title: "The Joy Code", subtitle: "Book One" },
    { id: "b", title: "The Joy Code", subtitle: "Book Two" },
  ]);
  assert.equal(groups.length, 2);
});

test("a final approval applies only to the exact approved revision", () => {
  const project = {
    id: "p1",
    title: "Book",
    status: "ready_for_export",
    updated_at: "2026-08-28T10:00:00Z",
    metadata_plan: { publication_approval: { status: "approved", approved_revision_at: "2026-08-28T10:00:00Z", approved_at: "2026-08-28T10:01:00Z" } },
  };
  assert.equal(publicationApproval(project).approved, true);
  assert.equal(isDistributionReady(project), true);
  assert.equal(publicationApproval({ ...project, updated_at: "2026-08-28T11:00:00Z" }).stale, true);
  assert.equal(isDistributionReady({ ...project, updated_at: "2026-08-28T11:00:00Z" }), false);
});

test("Amazon is blocked only by verified publication evidence, not search URLs", () => {
  const projects = [{ id: "p1", source_book_id: "b1" }, { id: "p2", source_book_id: "b2" }];
  const ids = verifiedAmazonProjectIds(projects, [
    { id: "b1", title: "Verified", asin: "B012345678" },
    { id: "b2", title: "Search link only", asin: null },
  ], []);
  assert.equal(ids.has("p1"), true);
  assert.equal(ids.has("p2"), false);
});

test("published distribution records also block duplicate Amazon submission", () => {
  const ids = verifiedAmazonProjectIds([{ id: "p1" }], [], [
    { project_id: "p1", channel: "amazon_kdp", status: "published", external_id: "B012345678" },
  ]);
  assert.equal(ids.has("p1"), true);
});
