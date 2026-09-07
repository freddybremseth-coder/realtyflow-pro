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

test("property editorial migration persists raw facts plus generated JSON", () => {
  for (const column of [
    "source_description",
    "floor_label",
    "facing_source",
    "usage_source",
    "amenities_no",
    "editorial_no",
    "editorial_no_approved",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
  }
  assert.match(sql, /create unique index if not exists idx_properties_ref_unique/i);
  assert.match(sql, /create table if not exists public\.property_feed_source_cache/i);
  assert.match(sql, /create table if not exists public\.property_editorial_jobs/i);
  assert.match(sql, /unique \(property_id\)/i);
  assert.match(sql, /create index if not exists idx_property_editorial_jobs_ready/i);
});

test("raw feed source is preserved separately from generated Norwegian copy", () => {
  assert.match(sql, /create trigger properties_preserve_feed_source/i);
  assert.match(sql, /new\.source_description := new\.description/i);
  assert.match(sql, /new\.source_description := coalesce\(old\.source_description, new\.description\)/i);
  assert.match(
    sql,
    /property_feed_source_cache[\s\S]*source_description text[\s\S]*amenities_no text\[\][\s\S]*facing_source text[\s\S]*usage_source text[\s\S]*expires_at timestamptz/i,
  );
});

test("feed fact changes queue editorial work without creating a worker feedback loop", () => {
  assert.match(sql, /create trigger properties_queue_editorial_job/i);
  assert.match(sql, /after insert or update of[\s\S]*source_description[\s\S]*description[\s\S]*price[\s\S]*facing_source[\s\S]*usage_source/i);
  assert.doesNotMatch(
    sql.match(/after insert or update of[\s\S]*?on public\.properties/i)?.[0] || "",
    /editorial_no|title_no|description_no/i,
  );
  assert.match(sql, /new\.source[\s\S]*'redsp'[\s\S]*'xml'[\s\S]*'csv'/i);
});

test("editorial queue and source cache are service-only", () => {
  assert.match(sql, /revoke all on table public\.property_feed_source_cache from anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.property_editorial_jobs from anon, authenticated/i);
  assert.match(sql, /status in \('queued', 'processing', 'retry', 'failed'\)/i);
});
