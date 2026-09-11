import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260911170000_property_conversion_atomic_claim.sql",
  ),
  "utf8",
);

const route = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/cron/property-conversion-editorial/route.ts",
  ),
  "utf8",
);

test("conversion candidates are claimed atomically and cannot be double-claimed", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /conversion_no is null/i);
  assert.match(migration, /'status',\s*'processing'/i);
  assert.match(migration, /'claimed_at',\s*now\(\)/i);
  assert.match(migration, /update public\.properties[\s\S]*returning to_jsonb\(p\.\*\)/i);
});

test("stale processing leases recover without allowing immediate duplicate work", () => {
  assert.match(migration, /p_stale_minutes integer default 20/i);
  assert.match(migration, /conversion_no ->> 'status' = 'processing'/i);
  assert.match(migration, /make_interval\(mins => greatest\(p_stale_minutes, 1\)\)/i);
});

test("claim function is service-role only", () => {
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/i);
});

test("conversion cron uses atomic claim RPC instead of nullable PostgREST selection", () => {
  assert.match(route, /\.rpc\(\s*"claim_property_conversion_candidates"/i);
  assert.doesNotMatch(route, /\.is\(\s*"conversion_no"\s*,\s*null\s*\)/i);
  assert.match(route, /claimed_refs/i);
  assert.match(route, /claimed_ids/i);
});

test("generation failures persist a terminal failure state instead of immediately looping", () => {
  assert.match(route, /status:\s*"failed"/i);
  assert.match(route, /failed_at:/i);
  assert.match(route, /error:\s*message\.slice\(0, 1000\)/i);
});
