import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260829173000_book_os_controlled_taxonomy.sql"), "utf8");

test("controlled taxonomy staging is canonical, atomic and server-only", () => {
  assert.match(sql, /publishing_stage_taxonomy_bundle/);
  assert.match(sql, /publishing_decide_taxonomy_bundle/);
  assert.match(sql, /security definer/g);
  assert.match(sql, /set search_path = ''/g);
  assert.match(sql, /is_canonical/);
  assert.match(sql, /Five to seven keywords are required/);
  assert.match(sql, /revoke all on function .* from public, anon, authenticated/);
  assert.match(sql, /grant execute .* to service_role/);
});

test("taxonomy proposals remain separate from applied channel metadata", () => {
  assert.match(sql, /status = 'proposed'/);
  assert.match(sql, /status = 'approved'/);
  assert.doesNotMatch(sql, /status = 'applied'/);
  assert.doesNotMatch(sql, /book_growth_channel_metadata/);
});
