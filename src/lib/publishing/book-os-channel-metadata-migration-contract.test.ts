import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260829201500_book_os_channel_metadata_packages.sql"), "utf8");
test("channel packages are canonical, server-only and atomic", () => {
  assert.match(sql, /publishing_stage_channel_metadata_bundle/);
  assert.match(sql, /publishing_decide_channel_metadata_bundle/);
  assert.match(sql, /is_canonical/);
  assert.match(sql, /exactly four channel packages/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on (table|function).*public, anon, authenticated/g);
  assert.match(sql, /set search_path = ''/g);
});
test("approval is not retailer submission or application", () => {
  assert.doesNotMatch(sql, /status in \([^)]*submitted/);
  assert.doesNotMatch(sql, /publishing_distribution_publications/);
  assert.match(sql, /explicitly unsent/);
});
