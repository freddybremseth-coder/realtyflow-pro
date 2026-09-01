import assert from "node:assert/strict";
import test from "node:test";
import { productionHandoffPreflight } from "./book-production-handoff-preflight";

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "book-1",
    title: "War Capital",
    subtitle: "The Battle for the New World Order",
    series_name: "War Capital",
    language: "en",
    status: "ready_for_export",
    chapter_drafts: [{ title: "One", body: "Text" }],
    metadata_plan: {
      kdp: {
        description_html: "A serious description.",
        keywords: ["war capital", "geopolitics"],
        categories: ["History", "Economics"],
      },
    },
    ...overrides,
  };
}

test("marks a complete project as a publication-ready candidate without writes", () => {
  const result = productionHandoffPreflight(project(), true);
  assert.equal(result.ok, true);
  assert.equal(result.productionStatus, "publication_ready_candidate");
  assert.equal(result.chapterCount, 1);
  assert.equal(result.metadata.descriptionPresent, true);
  assert.equal(result.metadata.keywordCount, 2);
  assert.equal(result.metadata.categoryCount, 2);
  assert.ok(result.plannedArtifacts.includes("print_interior_6x9_pdf"));
  assert.ok(result.plannedArtifacts.includes("kdp_full_wrap_pdf"));
});

test("blocks incomplete retailer metadata before immutable generation", () => {
  const result = productionHandoffPreflight(project({ metadata_plan: { kdp: { keywords: [], categories: [] } } }), true);
  assert.equal(result.ok, false);
  assert.match(result.blocking.join(" "), /description/i);
  assert.match(result.blocking.join(" "), /keyword/i);
  assert.match(result.blocking.join(" "), /category/i);
});

test("blocks projects without ready status, chapters or cover", () => {
  const result = productionHandoffPreflight(project({ status: "draft", chapter_drafts: [] }), false);
  assert.equal(result.ok, false);
  assert.match(result.blocking.join(" "), /ready_for_export/);
  assert.match(result.blocking.join(" "), /chapters/);
  assert.match(result.blocking.join(" "), /cover/);
});
