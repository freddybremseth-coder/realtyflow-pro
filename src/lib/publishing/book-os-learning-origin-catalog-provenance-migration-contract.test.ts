import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260901214500_book_os_learning_origin_catalog_provenance.sql"),
  "utf8",
);

test("Book Engine ingest provenance is scoped to deterministic book-engine work keys", () => {
  assert.match(sql, /workKey/);
  assert.match(sql, /book-engine:%/);
  assert.match(sql, /substring\(v_work_key from length\('book-engine:'\) \+ 1\)::uuid/);
  assert.match(sql, /book_engine_ingest_project_key_invalid/);
});

test("canonical edition is bound to the exact source project and conflicts are rejected", () => {
  assert.match(sql, /publishing_catalog_editions/);
  assert.match(sql, /canonical_project_id = v_project_id/);
  assert.match(sql, /canonical_project_id is null or canonical_project_id = v_project_id/);
  assert.match(sql, /book_engine_ingest_project_conflict/);
});

test("structured Book OS origin is preserved on canonical revision metadata", () => {
  assert.match(sql, /metadata_plan->'book_os_origin'/);
  assert.match(sql, /publishing_catalog_revisions/);
  assert.match(sql, /'book_os_origin', v_origin/);
  assert.match(sql, /'source_project_id', v_project_id/);
  assert.match(sql, /provenance_preserved_at/);
});

test("provenance trigger runs after package ingest and has no approval or publication side effects", () => {
  assert.match(sql, /after insert on public\.publishing_package_ingests/i);
  assert.doesNotMatch(sql, /publishing_decide_learning_proposal/);
  assert.doesNotMatch(sql, /publishing_decide_launch_release_candidate/);
  assert.doesNotMatch(sql, /publishing_distribution_jobs/);
  assert.doesNotMatch(sql, /status\s*=\s*'approved'/i);
  assert.doesNotMatch(sql, /published_at/i);
});
