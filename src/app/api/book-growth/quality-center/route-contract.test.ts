import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("quality center is admin-only and imports legacy bibles as review records", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /action === "approve_bible_bundle"/);
  assert.match(route, /action !== "import_existing_bibles"/);
  assert.match(route, /status: "review"/);
  assert.doesNotMatch(route, /status: "approved"/);
  assert.match(route, /content_fingerprint/);
  assert.match(route, /readiness\.missingBibles\.includes\("series_bible"\) && hasSeriesBibleSource/);
});

test("quality center derives readiness from exact revision data", () => {
  assert.match(route, /row\.edition_id === edition\.id && row\.is_canonical/);
  assert.match(route, /row\.revision_id === canonicalRevision\.id/);
  assert.match(route, /qualityTaxonomyReadiness/);
});
