import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830110000_book_os_launch_item_review.sql"), "utf8");

test("calendar edits retain immutable versions and attribution", () => {
  assert.match(sql, /publishing_launch_calendar_item_versions/);
  assert.match(sql, /unique \(calendar_item_id, version\)/);
  assert.match(sql, /publishing_launch_calendar_capture_initial_version/);
  assert.match(sql, /Editor and change reason are required/);
  assert.match(sql, /Channel, content type and campaign day cannot be changed here/);
});

test("calendar review enforces draft, submitted and approved transitions", () => {
  assert.match(sql, /status in \('draft','ready_for_review','approved','cancelled'\)/);
  assert.match(sql, /Only a draft can be submitted/);
  assert.match(sql, /Only submitted content can be approved/);
  assert.match(sql, /Only reviewed content can be returned/);
  assert.match(sql, /Return and cancellation require a note/);
  assert.match(sql, /publishing_launch_calendar_item_decisions/);
});

test("item review is server-only and cannot create external publications", () => {
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger[\s\S]*publishing_launch_calendar_items from service_role/);
  assert.match(sql, /revoke all on function public\.publishing_edit_launch_calendar_item\(uuid,jsonb,text,text\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.publishing_decide_launch_calendar_item\(uuid,text,text,text\) from public, anon, authenticated/);
  assert.match(sql, /'external_publications_created', false/g);
  assert.doesNotMatch(sql, /insert into public\.(marketing_publications|content_publications)/);
});
