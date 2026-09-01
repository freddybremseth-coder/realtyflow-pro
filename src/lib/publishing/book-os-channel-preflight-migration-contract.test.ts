import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830140000_book_os_channel_preflight.sql"), "utf8");

test("channel preflight stores immutable versioned readiness snapshots", () => {
  assert.match(sql, /create table public\.publishing_launch_channel_preflights/);
  assert.match(sql, /unique \(handoff_id, run_number\)/);
  assert.match(sql, /status in \('ready','blocked'\)/);
  assert.match(sql, /checks jsonb not null/);
  assert.match(sql, /blocker_codes text\[\]/);
});

test("preflight checks queue, approval, connection, content, schedule and cover", () => {
  for (const code of ["handoff_queued", "approval_current", "channel_connected", "content_valid", "schedule_future", "cover_ready"]) {
    assert.match(sql, new RegExp(`'code','${code}'`));
  }
  assert.match(sql, /public\.social_channels/);
  assert.match(sql, /books\.freddybremseth\.com/);
  assert.match(sql, /public\.publishing_catalog_assets/);
});

test("ready preflight remains service-only and never publishes", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.publishing_launch_channel_preflights from public, anon, authenticated, service_role/);
  assert.match(sql, /external_publications_created', false/);
  assert.doesNotMatch(sql, /insert into public\.(marketing_publications|content_publications|publishing_distribution_)/i);
  assert.doesNotMatch(sql, /https?:\/\//i);
});
