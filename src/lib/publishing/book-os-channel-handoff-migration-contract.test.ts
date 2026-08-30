import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830130000_book_os_channel_handoff.sql"), "utf8");

test("handoff snapshots are versioned, immutable and internal", () => {
  assert.match(sql, /create table public\.publishing_launch_channel_handoffs/);
  assert.match(sql, /attempt integer not null/);
  assert.match(sql, /unique \(calendar_item_id, item_version, attempt\)/);
  assert.match(sql, /coalesce\(max\(attempt\), 0\) \+ 1/);
  assert.match(sql, /payload_snapshot jsonb not null/);
  assert.match(sql, /idempotency_key text not null unique/);
  assert.match(sql, /status in \('prepared','queued','withdrawn'\)/);
});

test("only approved current content can enter the internal channel queue", () => {
  assert.match(sql, /selected\.status <> 'approved'/);
  assert.match(sql, /item\.current_version <> selected\.item_version/);
  assert.match(sql, /Only prepared handoff can be queued/);
  assert.match(sql, /Withdraw active channel handoff before revising approved content/);
});

test("handoff is service-only and cannot create external publications", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.publishing_launch_channel_handoffs from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select on table public\.publishing_launch_channel_handoffs to service_role/);
  assert.match(sql, /external_publications_created', false/g);
  assert.doesNotMatch(sql, /insert into public\.(marketing_publications|content_publications|publishing_distribution_)/i);
  assert.doesNotMatch(sql, /https?:\/\//i);
});
