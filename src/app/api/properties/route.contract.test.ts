import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/properties/route.ts"),
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
  assert.match(route, /orientation_source/);
});
