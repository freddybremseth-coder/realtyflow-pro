import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260912172000_stop_property_conversion_requeue_loop.sql",
  ),
  "utf8",
);

test("editorial queue trigger ignores no-op feed updates", () => {
  assert.match(sql, /create or replace function public\.queue_property_editorial_job\(\)/i);
  assert.match(sql, /if tg_op = 'UPDATE'[\s\S]*source_description is not distinct from old\.source_description/i);
  assert.match(sql, /new\.description is not distinct from old\.description/i);
  assert.match(sql, /new\.amenities_no is not distinct from old\.amenities_no/i);
  assert.match(sql, /return new;[\s\S]*insert into public\.property_editorial_jobs/i);
});

test("conversion invalidation ignores generated-copy town drift", () => {
  assert.match(sql, /create or replace function public\.invalidate_property_conversion_editorial\(\)/i);
  assert.match(sql, /only_generated_town_changed boolean/i);
  assert.match(sql, /new\.town is distinct from old\.town[\s\S]*description_no_changed/i);
  assert.match(sql, /not source_description_changed[\s\S]*not description_changed/i);
  assert.match(sql, /new\.town is distinct from old\.town[\s\S]*and not only_generated_town_changed/i);
});

test("conversion invalidation still treats description_no as last-resort source", () => {
  assert.match(sql, /source_available :=/i);
  assert.match(sql, /description_available :=/i);
  assert.match(sql, /not source_available[\s\S]*not description_available[\s\S]*description_no_changed/i);
});

test("conversion invalidation trigger includes town explicitly", () => {
  const trigger = sql.match(/create trigger trg_invalidate_property_conversion_editorial[\s\S]*?execute function public\.invalidate_property_conversion_editorial\(\);/i)?.[0] || "";
  assert.match(trigger, /before insert or update of/i);
  assert.match(trigger, /\btown\b/i);
  assert.match(trigger, /\bdescription_no\b/i);
});
