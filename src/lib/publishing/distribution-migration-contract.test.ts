import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827183641_book_distribution_control_plane.sql"),
  "utf8",
).toLowerCase();

const tables = [
  "publishing_channel_connections",
  "publishing_distribution_publications",
  "publishing_distribution_jobs",
];

test("distribution migration creates one canonical server-only control plane", () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`));
  }
  assert.match(migration, /for all to anon, authenticated\s+using \(false\) with check \(false\)/);
  assert.match(migration, /never store provider credentials or tokens/);
});

test("publication work is idempotent, approval-gated and connected to existing book tables", () => {
  assert.match(migration, /project_id uuid not null references public\.publishing_book_projects\(id\)/);
  assert.match(migration, /book_id uuid references public\.publishing_books\(id\)/);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /'awaiting_approval'/);
  assert.match(migration, /approved_by text/);
  assert.match(migration, /approved_at timestamptz/);
  assert.match(migration, /function public\.publishing_distribution_transition_job\(/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke execute on function public\.publishing_distribution_transition_job\([^;]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.publishing_distribution_transition_job\([^;]+to service_role/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});
