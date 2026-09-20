import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoveryStorageHttpStatus } from "./seo-discovery-storage";

test("a referral can be marked captured only after a confirmed database write", () => {
  assert.equal(discoveryStorageHttpStatus("stored"), 204);
  assert.equal(discoveryStorageHttpStatus("unavailable"), 503);
  assert.equal(discoveryStorageHttpStatus("write_failed"), 503);
});

test("public collector never acknowledges an unavailable database or a failed insert as a captured event", () => {
  const route = readFileSync(new URL("../../app/api/public/search-discovery/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!supabase\) \{[\s\S]*?discoveryStorageHttpStatus\("unavailable"\)/);
  assert.match(route, /if \(error\) \{[\s\S]*?discoveryStorageHttpStatus\("write_failed"\)/);
  assert.match(route, /\} catch \{[\s\S]*?discoveryStorageHttpStatus\("write_failed"\)/);
  assert.match(route, /return new NextResponse\(null, \{\s*status: discoveryStorageHttpStatus\("stored"\)/);
  assert.match(route, /headers: \{ \.\.\.corsHeaders\(origin\), "Cache-Control": "no-store" \}/);
});
