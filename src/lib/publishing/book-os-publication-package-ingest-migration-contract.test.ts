import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260901113000_book_os_publication_package_ingest.sql"),
  "utf8",
);

test("publication package ingest is audited and idempotent", () => {
  assert.match(sql, /create table if not exists public\.publishing_package_ingests/);
  assert.match(sql, /ingest_key text not null unique/);
  assert.match(sql, /package_fingerprint text not null/);
  assert.match(sql, /create or replace function public\.publishing_ingest_publication_package/);
  assert.match(sql, /where ingest_key=v_ingest_key/);
  assert.match(sql, /idempotent',true/);
});

test("publication package ingest preserves approval boundaries", () => {
  assert.match(sql, /'review',true/);
  assert.match(sql, /'approved',false,'published',false/);
  assert.doesNotMatch(sql, /publishing_decide_launch_campaign\s*\(/i);
  assert.doesNotMatch(sql, /publishing_decide_launch_release_candidate\s*\(/i);
  assert.doesNotMatch(sql, /publishing_distribution_publications\s*\(/i);
});

test("publication package ingest registers canonical production assets", () => {
  for (const type of ["manuscript_docx", "epub", "pdf", "cover", "sample", "metadata", "package_zip"]) {
    assert.match(sql, new RegExp(type));
  }
  assert.match(sql, /public\.publishing_catalog_assets/);
  assert.match(sql, /next_gate','quality_center'/);
});
