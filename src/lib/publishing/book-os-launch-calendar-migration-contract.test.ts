import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830103000_book_os_launch_calendar.sql"), "utf8");

test("launch activation requires current approved canonical sources", () => {
  assert.match(sql, /Campaign must be approved before activation/);
  assert.match(sql, /Campaign revision is no longer canonical/);
  assert.match(sql, /Source metadata is no longer approved/);
  assert.match(sql, /Source assets are no longer canonical/);
  assert.match(sql, /A valid IANA timezone is required/);
});

test("launch activation is idempotent and only creates internal drafts", () => {
  assert.match(sql, /campaign_id uuid not null unique/);
  assert.match(sql, /publishing_launch_activations_one_active_edition[\s\S]*where status in \('active','paused'\)/);
  assert.match(sql, /unique \(activation_id, source_item_index\)/);
  assert.match(sql, /'external_publications_created', false/g);
  assert.match(sql, /status text not null default 'draft'/);
  assert.doesNotMatch(sql, /insert into public\.marketing_publications/);
  assert.doesNotMatch(sql, /insert into public\.content_publications/);
});

test("launch calendar tables and activation RPC are server-only", () => {
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2);
  assert.equal((sql.match(/revoke all on table .* from public, anon, authenticated/g) ?? []).length, 2);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /revoke all on function public\.publishing_activate_launch_campaign\(uuid,date,text,text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.publishing_activate_launch_campaign\(uuid,date,text,text\) to service_role/);
});
