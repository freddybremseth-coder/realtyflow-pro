import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/properties/route.ts"),
  "utf8",
);
const middleware = fs.readFileSync(
  path.join(process.cwd(), "src/middleware.ts"),
  "utf8",
);

test("feed imports preserve property UUIDs by upserting on ref instead of deleting rows", () => {
  assert.match(route, /\.upsert\(withRef, \{ onConflict: "ref" \}\)/);
  assert.doesNotMatch(route, /\.from\("properties"\)[\s\S]{0,120}\.delete\(\)[\s\S]{0,120}\.in\("ref"/);
});

test("property POST attaches cached full source facts before upsert", () => {
  assert.match(route, /attachCachedFeedSourceFacts\(supabase, receivedItems\)/);
  assert.match(route, /property_feed_source_cache/);
  assert.match(route, /source_description/);
  assert.match(route, /amenities_no/);
  assert.match(route, /floor_label/);
  assert.match(route, /facing_source/);
  assert.match(route, /usage_source/);
});

test("anonymous property reads use an explicit public projection and website visibility", () => {
  assert.match(route, /getRequestAccessContext\(req\)/);
  assert.match(route, /const selectColumns = authenticated \? "\*" : PUBLIC_PROPERTY_SELECT/);
  assert.match(route, /const scopedData = authenticated \? allData : allData\.filter\(isWebsiteVisible\)/);
  assert.match(route, /!authenticated && \(!property \|\| !isWebsiteVisible\(property\)\)/);

  const projection = route.match(/const PUBLIC_PROPERTY_SELECT = \[([\s\S]*?)\]\.join\(","\);/)?.[1] || "";
  assert.ok(projection, "PUBLIC_PROPERTY_SELECT must remain explicit");
  for (const internalField of [
    "import_source_id",
    "source_description",
    "brand_visibility",
    "editorial_no",
    "editorial_no_approved",
    "conversion_no",
    "facing_source",
    "usage_source",
  ]) {
    assert.doesNotMatch(projection, new RegExp(`\\b${internalField}\\b`));
  }
});

test("only the root property feed is public; nested property routes require session middleware", () => {
  const exactBlock = middleware.match(/const PUBLIC_EXACT_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const prefixBlock = middleware.match(/const PUBLIC_PATHS = \[([\s\S]*?)\];/)?.[1] || "";

  assert.match(exactBlock, /"\/api\/properties"/);
  assert.doesNotMatch(prefixBlock, /"\/api\/properties"/);
  assert.match(middleware, /PUBLIC_EXACT_PATHS\.has\(pathname\)/);
});
