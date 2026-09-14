import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/review-console/route.ts"), "utf8");

test("Freddy Review Console is admin-only and selects only normalized decision work", () => {
  assert.match(source, /requireAdminApi\(request\)/);
  assert.match(source, /describeFreddyReview/);
  assert.match(source, /OPEN_STATUSES/);
});

test("console exposes the full decision context without adding a provider-send path", () => {
  for (const value of ["buyerProfile", "match:", "shortlist:", "presentation:", "draft:", "policy,"]) {
    assert.match(source, new RegExp(value));
  }
  assert.match(source, /directProviderSend: false/);
  assert.match(source, /approvalRunsPreflight: true/);
  assert.doesNotMatch(source, /sendBrandEmail/);
});
