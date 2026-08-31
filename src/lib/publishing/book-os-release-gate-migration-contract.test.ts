import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830160000_book_os_release_gate.sql"), "utf8");

test("release candidates lock the approved version, preflight and payload snapshot", () => {
  assert.match(sql, /create table public\.publishing_launch_release_candidates/);
  assert.match(sql, /preflight_id uuid not null unique/);
  assert.match(sql, /item_version integer not null/);
  assert.match(sql, /payload_snapshot jsonb not null/);
  assert.match(sql, /scheduled_for_snapshot timestamptz not null/);
  assert.match(sql, /pending_approval.*approved.*revoked.*stale/);
});

test("only the latest ready preflight can be approved and later controls stale releases", () => {
  assert.match(sql, /order by run_number desc limit 1/);
  assert.match(sql, /preflight\.status <> 'ready'/);
  assert.match(sql, /latest_preflight_id is distinct from selected\.preflight_id/);
  assert.match(sql, /publishing_launch_stale_release_on_preflight/);
  assert.match(sql, /publishing_launch_stale_release_on_handoff_withdrawal/);
  assert.match(sql, /status='stale'/);
});

test("release decisions are service-only internal approvals and never publish", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.publishing_launch_release_candidates from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select on table public\.publishing_launch_release_candidates to service_role/);
  assert.match(sql, /revoke all on function public\.publishing_prepare_launch_release_candidate\(uuid,text\) from public,anon,authenticated/);
  assert.match(sql, /external_publications_created',false/g);
  assert.doesNotMatch(sql, /insert into public\.(marketing_publications|content_publications|publishing_distribution_)/i);
});
