import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260911171747_property_conversion_atomic_claim.sql"),
  "utf8",
);
const migrationV2 = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260911201500_property_conversion_atomic_claim_v2.sql"),
  "utf8",
);
const migrationV2Upgrade = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260912173500_claim_outdated_property_conversions.sql"),
  "utf8",
);
const migrationV3 = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260914173500_property_conversion_verified_claim_v3.sql"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/property-conversion-editorial/route.ts"),
  "utf8",
);

test("legacy conversion candidates are claimed atomically", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /conversion_no is null/i);
  assert.match(migration, /'status',\s*'processing'/i);
  assert.match(migration, /'claimed_at',\s*now\(\)/i);
});

test("v2 claim RPC preserves atomic locking and outdated-V6 upgrade semantics", () => {
  assert.match(migrationV2, /returns setof public\.properties/i);
  assert.match(migrationV2, /for update skip locked/i);
  assert.match(migrationV2Upgrade, /p\.conversion_no is null/i);
  assert.match(migrationV2Upgrade, /conversion_no ->> 'version'[\s\S]*<> 'conversion-v6'/i);
  assert.match(migrationV2Upgrade, /not in \('processing', 'failed'\)/i);
});

test("v3 requires an explicit per-run claim token and returns only claim identity", () => {
  assert.match(migrationV3, /p_claim_token text default null/i);
  assert.match(migrationV3, /PROPERTY_CONVERSION_CLAIM_TOKEN_REQUIRED/i);
  assert.match(migrationV3, /returns table\s*\([\s\S]*id uuid[\s\S]*ref text[\s\S]*claim_token text/i);
  assert.match(migrationV3, /'claim_token',\s*v_claim_token/i);
  assert.match(migrationV3, /where c\.claim_token = v_claim_token/i);
});

test("v3 keeps atomic locking, stale-lease recovery and V6 eligibility rules", () => {
  assert.match(migrationV3, /for update skip locked/i);
  assert.match(migrationV3, /p_stale_minutes integer default 20/i);
  assert.match(migrationV3, /conversion_no ->> 'status' = 'processing'/i);
  assert.match(migrationV3, /make_interval\(mins => greatest\(p_stale_minutes, 1\)\)/i);
  assert.match(migrationV3, /p\.conversion_no is null/i);
  assert.match(migrationV3, /conversion_no ->> 'version'[\s\S]*<> 'conversion-v6'/i);
  assert.match(migrationV3, /not in \('processing', 'failed'\)/i);
});

test("v3 claim function is service-role only", () => {
  assert.match(migrationV3, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationV3, /grant execute on function[\s\S]*to service_role/i);
});

test("conversion cron uses v3 and verifies the durable database claim before generation", () => {
  assert.match(route, /\.rpc\(\s*"claim_property_conversion_candidates_v3"/i);
  assert.match(route, /const claimToken = crypto\.randomUUID\(\)/i);
  assert.match(route, /p_claim_token:\s*claimToken/i);
  assert.match(route, /hasVerifiedClaim\(row, claimToken\)/i);
  assert.match(route, /state\.status === "processing"/i);
  assert.match(route, /state\.claim_token === claimToken/i);
  assert.match(route, /PROPERTY_CONVERSION_CLAIM_NOT_DURABLE/i);
  assert.match(route, /\.from\("properties"\)[\s\S]*\.select\("\*"\)[\s\S]*\.in\("id", candidateIds\)/i);
  assert.match(route, /rpc_version:\s*"v3"/i);
});

test("final conversion write is fenced by the exact claim token", () => {
  assert.match(route, /\.eq\("conversion_no->>claim_token", claimToken\)/i);
  assert.match(route, /PROPERTY_CONVERSION_CLAIM_LOST/i);
  assert.match(route, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/i);
});

test("generation failures persist a terminal failure state under the same claim fence", () => {
  assert.match(route, /status:\s*"failed"/i);
  assert.match(route, /failed_at:/i);
  assert.match(route, /error:\s*message\.slice\(0, 1000\)/i);
  assert.match(route, /\.eq\("conversion_no->>claim_token", claimToken\)/i);
});
