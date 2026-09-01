import assert from "node:assert/strict";
import test from "node:test";
import {
  bookCockpitStatus,
  groupBookProjects,
  isDistributionReady,
  normalizeBookIdentityTitle,
  publicationApproval,
  publisherCockpitTargets,
  verifiedAmazonProjectIds,
} from "./book-workflow";

test("Publisher Cockpit exposes one clear next step for every lifecycle state", () => {
  const legacy = bookCockpitStatus({ id: "legacy", status: "draft", chapters: 4, words: 12000 });
  assert.equal(legacy.stage, 4);
  assert.equal(legacy.usesCurrentWorkflow, false);
  assert.equal(legacy.nextLabel, "Oppgrader til seriebibel og canon");

  const failed = bookCockpitStatus({
    id: "failed",
    status: "drafting",
    metadata_plan: { production_bible: { locked: true }, production_progress: { status: "failed", error: "OpenAI timeout" } },
  });
  assert.equal(failed.state, "attention");
  assert.equal(failed.error, "OpenAI timeout");

  const ready = bookCockpitStatus({ id: "ready", status: "ready_for_export", chapters: 12, words: 64000 });
  assert.equal(ready.state, "ready");
  assert.equal(ready.nextLabel, "Kontroller og godkjenn boken");

  const approved = bookCockpitStatus({
    id: "approved",
    status: "ready_for_export",
    updated_at: "2026-08-28T10:00:00Z",
    metadata_plan: { publication_approval: { status: "approved", approved_revision_at: "2026-08-28T10:00:00Z" } },
  });
  assert.equal(approved.state, "approved");
  assert.equal(approved.stage, 8);
  assert.equal(approved.nextLabel, "Selg og forbedre");
});

test("Publisher Cockpit prioritizes attention, publishing and growth targets independently", () => {
  const targets = publisherCockpitTargets([
    { id: "writing", updated_at: "2026-08-28T10:00:00Z", metadata_plan: { production_bible: { locked: true } } },
    { id: "failed", updated_at: "2026-08-27T10:00:00Z", metadata_plan: { production_progress: { status: "failed", label: "Stoppet" } } },
    { id: "ready", status: "ready_for_export", updated_at: "2026-08-26T10:00:00Z" },
    {
      id: "approved",
      status: "ready_for_export",
      updated_at: "2026-08-25T10:00:00Z",
      metadata_plan: { publication_approval: { status: "approved", approved_revision_at: "2026-08-25T10:00:00Z" } },
    },
  ]);
  assert.equal(targets.continueProject?.id, "failed");
  assert.equal(targets.publishProject?.id, "ready");
  assert.equal(targets.growthProject?.id, "approved");
  assert.equal(targets.attentionCount, 1);
});

test("artifact labels do not create separate book identities", () => {
  assert.equal(normalizeBookIdentityTitle("My Journey as a Father — Complete Manuscript v1.4 EPUB"), "my journey as a father");
  assert.equal(normalizeBookIdentityTitle("Hvem eier virkeligheten – ny hovedutgave v2 PDF"), "hvem eier virkeligheten");
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
