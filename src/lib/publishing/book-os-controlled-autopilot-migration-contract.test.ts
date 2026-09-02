import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260902070058_book_os_controlled_autopilot.sql"),
  "utf8",
);

test("controlled autopilot run state is durable, indexed and service-only", () => {
  assert.match(sql, /create table if not exists public\.publishing_book_production_runs/);
  assert.match(sql, /references public\.publishing_book_projects\(id\) on delete cascade/);
  assert.match(sql, /unique index if not exists publishing_book_production_runs_one_active_project[\s\S]*where status in \('queued', 'running'\)/);
  assert.match(sql, /alter table public\.publishing_book_production_runs enable row level security/);
  assert.match(sql, /revoke all on table public\.publishing_book_production_runs from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.publishing_book_production_runs to service_role/);
});

test("Book OS trigger functions are not callable through default Data API roles", () => {
  assert.match(sql, /revoke execute on function public\.publishing_guard_learning_origin_production\(\)[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /revoke execute on function public\.publishing_preserve_book_engine_origin_on_ingest\(\)[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.publishing_guard_learning_origin_production\(\)[\s\S]*to service_role/);
  assert.match(sql, /grant execute on function public\.publishing_preserve_book_engine_origin_on_ingest\(\)[\s\S]*to service_role/);
});

test("migration cannot modify existing books or approval data", () => {
  assert.doesNotMatch(sql, /\b(insert into|update public\.publishing_book_projects|delete from|truncate)\b/i);
});
