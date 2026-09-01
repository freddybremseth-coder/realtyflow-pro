import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260901211000_book_os_learning_origin_production_guard.sql"),
  "utf8",
);

test("learning-origin production trigger is scoped only to approved-learning projects", () => {
  assert.match(sql, /approved_learning_proposal/);
  assert.match(sql, /if v_origin_source <> 'approved_learning_proposal' then\s+return new;/i);
  assert.match(sql, /before update on public\.publishing_book_projects/i);
  assert.doesNotMatch(sql, /before insert/i);
});

test("database invariant requires explicit production start before production states", () => {
  assert.match(sql, /production_start_approved_at/);
  assert.match(sql, /learning_production_start_required/);
  assert.match(sql, /bible_generating/);
  assert.match(sql, /author_generating/);
});

test("database invariant requires locked canon before author generation", () => {
  assert.match(sql, /production_bible,locked/);
  assert.match(sql, /v_new_state = 'author_generating' and not v_bible_locked/i);
  assert.match(sql, /learning_canon_required/);
});

test("database invariant blocks chapter-writing shortcuts before author step", () => {
  assert.match(sql, /v_new_chapter_count > v_old_chapter_count/i);
  assert.match(sql, /author_generating','author_ready','author_partial/);
  assert.match(sql, /learning_author_step_required/);
});

test("guard is an invariant only and does not approve or publish anything", () => {
  assert.doesNotMatch(sql, /publishing_decide_learning_proposal/);
  assert.doesNotMatch(sql, /publishing_ingest_publication_package/);
  assert.doesNotMatch(sql, /publishing_distribution_jobs/);
  assert.doesNotMatch(sql, /release.*approved/i);
});
