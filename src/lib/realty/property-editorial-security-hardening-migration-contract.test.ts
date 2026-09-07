import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260907123700_property_editorial_security_hardening.sql",
  ),
  "utf8",
);

test("property editorial trigger functions cannot be called through anon or authenticated RPC", () => {
  assert.match(
    sql,
    /revoke execute on function public\.queue_property_editorial_job\(\) from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /revoke execute on function public\.preserve_property_feed_source\(\) from public, anon, authenticated/i,
  );
});
