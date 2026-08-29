import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260829090000_book_os_quality_taxonomy_foundation.sql"), "utf8");

test("phase 3 separates versioned canon, revision evidence and controlled taxonomy", () => {
  for (const table of [
    "publishing_work_bibles",
    "publishing_revision_quality_checks",
    "publishing_taxonomy_terms",
    "publishing_edition_taxonomy_assignments",
  ]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /references public\.publishing_catalog_works/);
  assert.match(migration, /references public\.publishing_catalog_revisions/);
  assert.match(migration, /references public\.publishing_catalog_editions/);
  assert.match(migration, /publishing_edition_taxonomy_assignment_identity/);
  assert.match(migration, /coalesce\(revision_id, '00000000-0000-0000-0000-000000000000'::uuid\)/);
});

test("AI results and human quality decisions cannot be conflated", () => {
  assert.match(migration, /result text not null default 'pending'/);
  assert.match(migration, /decision text not null default 'pending'/);
  assert.match(migration, /decided_by text/);
  assert.match(migration, /decision = 'pending' or/);
});

test("canon and taxonomy approval are attributable and server-only", () => {
  assert.match(migration, /publishing_work_bibles_one_approved/);
  assert.match(migration, /status <> 'approved' or \(nullif\(trim\(approved_by\)/);
  assert.match(migration, /status not in \('approved', 'applied'\) or/);
  assert.match(migration, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.match(migration, /to anon, authenticated using \(false\) with check \(false\)/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /drop\s+(table|column)/i);
});
