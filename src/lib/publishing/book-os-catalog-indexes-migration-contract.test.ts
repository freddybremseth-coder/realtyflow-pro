import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260829073500_book_os_catalog_indexes.sql"), "utf8");

test("catalogue relationship foreign keys have covering indexes", () => {
  for (const column of [
    "revision_id", "canonical_book_id", "canonical_project_id", "canonical_website_title_id",
    "candidate_id", "source_work_id", "target_work_id", "project_id",
  ]) assert.match(migration, new RegExp(`\\(${column}\\)`));
  assert.doesNotMatch(migration, /drop\s+(table|column|index)/i);
});
