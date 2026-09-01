import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260831192856_book_os_final_acceptance_index_hardening.sql",
  ),
  "utf8",
);

test("final acceptance hardening covers every remaining canonical Book OS foreign key", () => {
  assert.match(
    sql,
    /publishing_channel_metadata_revision_fk_idx[\s\S]*publishing_channel_metadata_packages \(revision_id\)/,
  );
  assert.match(
    sql,
    /publishing_distribution_publications_revision_fk_idx[\s\S]*publishing_distribution_publications \(revision_id\)[\s\S]*where revision_id is not null/,
  );
  assert.match(
    sql,
    /publishing_launch_campaigns_work_fk_idx[\s\S]*publishing_launch_campaigns \(work_id\)/,
  );
  assert.match(
    sql,
    /publishing_launch_campaigns_revision_fk_idx[\s\S]*publishing_launch_campaigns \(revision_id\)/,
  );
});

test("index hardening is idempotent and cannot change Book OS data", () => {
  assert.equal((sql.match(/create index if not exists/gi) ?? []).length, 4);
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|drop)\b/i);
});
