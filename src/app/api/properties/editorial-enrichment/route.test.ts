import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/properties/editorial-enrichment/route.ts"),
  "utf8",
);

test("manual editorial enrichment requires admin access and never approves generated copy automatically", () => {
  assert.match(route, /requireAdminApi\(req\)/);
  assert.match(route, /editorial_no_approved:\s*false/);
  assert.match(route, /existingEditorialHasSameSource/);
});

test("manual editorial enrichment persists structured Norwegian copy", () => {
  assert.match(route, /title_no:\s*editorial\.headline_no/);
  assert.match(route, /description_no:\s*editorialDescription\(editorial\)/);
  assert.match(route, /editorial_no:\s*editorial/);
});
