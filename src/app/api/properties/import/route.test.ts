import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/properties/import/route.ts"),
  "utf8",
);

test("XML import proxy is admin-only and validates public URLs", () => {
  assert.match(route, /requireAdminApi\(req\)/);
  assert.match(route, /validatePublicWebsiteUrl\(rawUrl\)/);
});

test("XML import stores full source facts without making cache availability a hard dependency", () => {
  assert.match(route, /extractRedspEditorialSourceRows\(xmlText\)/);
  assert.match(route, /property_feed_source_cache/);
  assert.match(route, /source cache skipped/);
  assert.match(route, /return new NextResponse\(text/);
});
