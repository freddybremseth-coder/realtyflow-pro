import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830104000_book_os_launch_calendar_indexes.sql"), "utf8");

test("launch calendar foreign keys have covering indexes", () => {
  assert.match(sql, /publishing_launch_activations_revision_fk_idx[\s\S]*publishing_launch_activations \(revision_id\)/);
  assert.match(sql, /publishing_launch_activations_work_fk_idx[\s\S]*publishing_launch_activations \(work_id\)/);
  assert.match(sql, /publishing_launch_calendar_items_campaign_fk_idx[\s\S]*publishing_launch_calendar_items \(campaign_id\)/);
});

test("index hardening is idempotent and does not mutate launch data", () => {
  assert.equal((sql.match(/create index if not exists/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|drop)\b/i);
  assert.doesNotMatch(sql, /marketing_publications|content_publications/);
});
