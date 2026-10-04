import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/area-profiles/route.ts"),
  "utf8",
);

test("public area reads fail fast and circuit-break during Supabase outages", () => {
  assert.match(route, /PUBLIC_AREA_READ_TIMEOUT_MS = 6000/);
  assert.match(route, /controller\.abort\(new Error\("Supabase request timed out"\)\)/);
  assert.match(route, /if \(publicOnly && publicAreaCircuitOpenUntil > Date\.now\(\)\)/);
  assert.match(route, /publicAreaCircuitOpenUntil = Date\.now\(\) \+ 30_000/);
  assert.match(route, /status: 503/);
  assert.match(route, /"Retry-After": "15"/);
  assert.match(route, /public, s-maxage=15, stale-while-revalidate=30/);
});

test("admin area reads do not opt into the public timeout client", () => {
  assert.match(route, /getSupabase\(publicOnly \? PUBLIC_AREA_READ_TIMEOUT_MS : undefined\)/);
});
