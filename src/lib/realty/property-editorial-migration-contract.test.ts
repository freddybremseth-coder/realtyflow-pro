import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260907122000_property_feed_norwegian_editorial.sql",
  ),
  "utf8",
);

test("property editorial migration is additive and persists source plus generated JSON", () => {
  for (const column of [
    "source_description",
    "floor_label",
    "orientation_source",
    "editorial_no",
    "editorial_no_approved",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
  }
  assert.match(sql, /create table if not exists public\.property_editorial_jobs/i);
  assert.match(sql, /unique \(property_id\)/i);
  assert.match(sql, /create index if not exists idx_property_editorial_jobs_ready/i);
});

test("feed fact changes queue editorial work without creating a worker feedback loop", () => {
  assert.match(sql, /create trigger properties_queue_editorial_job/i);
  assert.match(sql, /after insert or update of[\s\S]*source_description[\s\S]*description[\s\S]*price/i);
  assert.doesNotMatch(
    sql.match(/after insert or update of[\s\S]*?on public\.properties/i)?.[0] || "",
    /editorial_no|title_no|description_no/i,
  );
  assert.match(sql, /new\.source[\s\S]*'redsp'[\s\S]*'xml'[\s\S]*'csv'/i);
});

test("editorial queue is service-only and retries are represented explicitly", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.property_editorial_jobs from anon, authenticated/i);
  assert.match(sql, /status in \('queued', 'processing', 'retry', 'failed'\)/i);
});
