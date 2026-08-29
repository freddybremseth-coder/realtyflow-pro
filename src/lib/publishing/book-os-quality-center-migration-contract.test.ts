import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260829125000_book_os_quality_center_approval.sql"), "utf8");

test("quality center bible bundle approval is atomic and service-only", () => {
  assert.match(sql, /publishing_approve_work_bible_bundle\(bible_ids uuid\[\], actor text\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /for update/);
  assert.match(sql, /status = 'superseded'/);
  assert.match(sql, /status = 'approved'/);
  assert.match(sql, /revoke all on function .* from public, anon, authenticated/);
  assert.match(sql, /grant execute .* to service_role/);
});

test("bundle cannot mix works, duplicate types or empty content", () => {
  assert.match(sql, /selected_types <> selected_count/);
  assert.match(sql, /work_id <> selected_work/);
  assert.match(sql, /content = '\{\}'::jsonb/);
  assert.doesNotMatch(sql, /delete from/i);
});
