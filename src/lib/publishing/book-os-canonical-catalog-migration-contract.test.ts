import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  "supabase/migrations/20260829065015_book_os_canonical_catalog.sql",
  "utf8",
).toLowerCase();

test("canonical catalogue separates work, edition, revision, asset and identifier", () => {
  for (const table of [
    "publishing_catalog_works",
    "publishing_catalog_editions",
    "publishing_catalog_revisions",
    "publishing_catalog_assets",
    "publishing_catalog_identifiers",
    "publishing_catalog_source_links",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(sql, /publishing_catalog_one_canonical_revision/);
  assert.match(sql, /publishing_catalog_one_canonical_asset/);
  assert.match(sql, /add column if not exists edition_id uuid references public\.publishing_catalog_editions/);
  assert.match(sql, /add column if not exists revision_id uuid references public\.publishing_catalog_revisions/);
});

test("catalogue backfill is traceable and never deletes source records", () => {
  assert.match(sql, /insert into public\.publishing_catalog_source_links/);
  assert.match(sql, /source_type in \('book_title', 'book_growth_work', 'publishing_book', 'publishing_book_project'\)/);
  assert.match(sql, /exact title matches are suggestions only/);
  assert.match(sql, /status text not null default 'pending'/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(book_titles|book_growth_works|publishing_books|publishing_book_projects)/);
});

test("catalogue reconciliation is approval gated and server-only", () => {
  assert.match(sql, /candidate\.status <> 'approved'/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.publishing_catalog_apply_merge_candidate\(uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.publishing_catalog_apply_merge_candidate\(uuid, text\) to service_role/);
  assert.match(sql, /alter table public\.%i enable row level security/);
  assert.match(sql, /using \(false\) with check \(false\)/);
});
