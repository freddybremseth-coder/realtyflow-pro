import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260828192500_book_os_foundation_stabilization.sql"),
  "utf8",
).toLowerCase();

test("book growth work-item roll-up is reversible and concurrency safe", () => {
  assert.match(migration, /set\s+status = 'cancelled'/);
  assert.match(migration, /book_os_rollup/);
  assert.match(migration, /superseded_by/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.work_items/);
  assert.match(migration, /create unique index work_items_book_growth_open_action_unique/);
  assert.match(migration, /metadata->>'book_id'/);
  assert.match(migration, /metadata->>'action_type'/);
});

test("book growth operational data and mutation RPC are server-only", () => {
  assert.match(migration, /alter table public\.%i enable row level security/);
  assert.match(migration, /revoke all on table public\.%i from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.%i to service_role/);
  assert.match(migration, /for all to anon, authenticated using \(false\) with check \(false\)/);
  assert.match(migration, /alter function public\.book_growth_apply_channel_metadata_candidate\(uuid,text\) set search_path = ''/);
  assert.match(migration, /revoke execute on function public\.book_growth_apply_channel_metadata_candidate\(uuid,text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.book_growth_apply_channel_metadata_candidate\(uuid,text\) to service_role/);
});
