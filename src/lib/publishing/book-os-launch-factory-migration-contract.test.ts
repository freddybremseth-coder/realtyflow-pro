import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830090000_book_os_launch_factory_foundation.sql"), "utf8");
test("launch campaign is canonical, attributable, capped and server-only", () => {
  assert.match(sql, /Four approved channel metadata packages are required/);
  assert.match(sql, /Verified canonical EPUB is required/);
  assert.match(sql, /Verified canonical cover is required/);
  assert.match(sql, /maxTotalPerWeek.*> 4/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on (table|function).*public, anon, authenticated/g);
  assert.match(sql, /set search_path = ''/g);
});
test("one campaign approval remains separate from scheduling and publication", () => {
  assert.match(sql, /publishing_decide_launch_campaign/);
  assert.match(sql, /'scheduled',false,'published',false/);
  assert.doesNotMatch(sql, /insert into public\.marketing_publications/);
  assert.doesNotMatch(sql, /insert into public\.content_publications/);
});
