import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260911171747_property_conversion_atomic_claim.sql",
  ),
  "utf8",
);

const migrationV2 = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260911201500_property_conversion_atomic_claim_v2.sql",
  ),
  "utf8",
);

const migrationV2Upgrade = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260912173500_claim_outdated_property_conversions.sql",
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
});

test("v2 claim RPC preserves atomic locking and returns ordinary property rows", () => {
  assert.match(migrationV2, /returns setof public\.properties/i);
  assert.match(migrationV2, /for update skip locked/i);
  assert.match(migrationV2, /conversion_no is null/i);
  assert.match(migrationV2, /returning p\.\*/i);
});

test("v2 claim RPC also upgrades outdated non-V6 conversion JSON", () => {
  assert.match(migrationV2Upgrade, /returns setof public\.properties/i);
  assert.match(migrationV2Upgrade, /for update skip locked/i);
  assert.match(migrationV2Upgrade, /p\.conversion_no is null/i);
  assert.match(migrationV2Upgrade, /conversion_no ->> 'version'[\s\S]*<> 'conversion-v6'/i);
  assert.match(migrationV2Upgrade, /not in \('processing', 'failed'\)/i);
  assert.match(migrationV2Upgrade, /'status',\s*'processing'/i);
  assert.match(migrationV2Upgrade, /returning p\.\*/i);
});

test("stale processing leases recover without allowing immediate duplicate work", () => {
  assert.match(migrationV2, /p_stale_minutes integer default 20/i);
  assert.match(migrationV2, /conversion_no ->> 'status' = 'processing'/i);
  assert.match(migrationV2, /make_interval\(mins => greatest\(p_stale_minutes, 1\)\)/i);
});

test("v2 claim function is service-role only", () => {
  assert.match(migrationV2, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationV2, /grant execute on function[\s\S]*to service_role/i);
});

test("conversion cron uses v2 atomic claim RPC and consumes rows directly", () => {
  assert.match(route, /\.rpc\(\s*"claim_property_conversion_candidates_v2"/i);
  assert.doesNotMatch(route, /\.is\(\s*"conversion_no"\s*,\s*null\s*\)/i);
  assert.doesNotMatch(route, /claimedProperty\(/i);
  assert.match(route, /rpc_version:\s*"v2"/i);
  assert.match(route, /claimed_refs/i);
  assert.match(route, /claimed_ids/i);
});

test("generation failures persist a terminal failure state instead of immediately looping", () => {
  assert.match(route, /status:\s*"failed"/i);
  assert.match(route, /failed_at:/i);
  assert.match(route, /error:\s*message\.slice\(0, 1000\)/i);
});
