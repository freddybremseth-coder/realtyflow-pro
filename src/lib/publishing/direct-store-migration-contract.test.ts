import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827191925_book_direct_store_connector.sql"),
  "utf8",
).toLowerCase();

test("direct-store migration keeps EPUB and sales data server-only", () => {
  assert.match(migration, /values \('book-epubs', 'book-epubs', false\)/);
  assert.match(migration, /create table if not exists public\.publishing_direct_sales/);
  assert.match(migration, /alter table public\.publishing_direct_sales enable row level security/);
  assert.match(migration, /revoke all on table public\.publishing_direct_sales from public, anon, authenticated/);
  assert.match(migration, /unique[\s\S]+stripe_session_id|stripe_session_id text not null unique/);
});

test("distribution execution and sale counters are atomic and service-only", () => {
  for (const fn of [
    "publishing_distribution_claim_job",
    "publishing_distribution_finish_job",
    "publishing_record_direct_sale",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${fn}\\(`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}\\([\\s\\S]+?from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]+?to service_role`));
  }
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /on conflict \(stripe_session_id\) do nothing/);
  assert.match(migration, /attempt_count = attempt_count \+ 1/);
});
