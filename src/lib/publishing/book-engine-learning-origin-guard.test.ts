import assert from "node:assert/strict";
import test from "node:test";
import { guardLearningOriginProduction } from "./book-engine-learning-origin-guard";

const normal = { status: "draft", metadata_plan: {} };
const pendingLearning = {
  status: "draft",
  metadata_plan: {
    generation_state: "registered",
    book_os_origin: { source: "approved_learning_proposal", learning_proposal_id: "p1", production_start_approved_at: null },
    production_progress: { status: "pending" },
  },
  outline_plan: { toc: [] },
  chapter_drafts: [],
};
const startApproved = {
  ...pendingLearning,
  metadata_plan: {
    ...pendingLearning.metadata_plan,
    generation_state: "production_start_approved",
    book_os_origin: { ...pendingLearning.metadata_plan.book_os_origin, production_start_approved_at: "2026-09-01T18:00:00Z" },
    production_progress: { status: "approved" },
  },
};
const canonReady = {
  ...startApproved,
  metadata_plan: {
    ...startApproved.metadata_plan,
    generation_state: "bible_ready",
    production_bible: { locked: true },
  },
};

test("normal Book Engine projects are untouched", () => {
  for (const mode of ["generate_seo", "generate_author", "continue"] as const) {
    assert.deepEqual(guardLearningOriginProduction(normal, mode), { allowed: true, learningOrigin: false });
  }
});

test("learning-origin SEO requires explicit production-start approval", () => {
  const blocked = guardLearningOriginProduction(pendingLearning, "generate_seo");
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.code, "learning_production_start_required");
  assert.deepEqual(guardLearningOriginProduction(startApproved, "generate_seo"), { allowed: true, learningOrigin: true });
});

test("learning-origin author generation requires locked canon after approved start", () => {
  const blocked = guardLearningOriginProduction(startApproved, "generate_author");
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.code, "learning_canon_required");
  assert.deepEqual(guardLearningOriginProduction(canonReady, "generate_author"), { allowed: true, learningOrigin: true });
});

test("learning-origin continue requires the author/outline step to have started", () => {
  const blocked = guardLearningOriginProduction(canonReady, "continue");
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.code, "learning_author_step_required");

  const outlined = { ...canonReady, outline_plan: { toc: [{ title: "Chapter 1" }] } };
  assert.deepEqual(guardLearningOriginProduction(outlined, "continue"), { allowed: true, learningOrigin: true });
});
