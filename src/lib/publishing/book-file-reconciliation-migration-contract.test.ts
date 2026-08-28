import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20260828062143_book_file_reconciliation.sql", "utf8");

test("file reconciliation is server-only and approval gated", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.book_file_reconciliation_candidates from public, anon, authenticated/i);
  assert.match(sql, /v_candidate\.status <> 'approved'/i);
  assert.match(sql, /ebook_file_path is null or ebook_file_path=v_candidate\.storage_path/i);
  assert.match(sql, /select 1 from storage\.objects where bucket_id=v_candidate\.storage_bucket and name=v_candidate\.storage_path/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke execute on function public\.book_file_reconciliation_apply\(uuid,text\) from public,anon,authenticated/i);
  assert.doesNotMatch(sql, /delete from storage\.objects/i);
});
