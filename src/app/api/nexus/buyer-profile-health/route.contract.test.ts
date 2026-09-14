import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/buyer-profile-health/route.ts"), "utf8");

test("Buyer Profile Health route is admin-only and read-only", () => {
  assert.match(route, /requireAdminApi/);
  assert.match(route, /adminOnly: true/);
  assert.match(route, /readOnly: true/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|sendBrandEmail/);
});

test("health route uses canonical approved profiles, criteria and shortlist quality", () => {
  for (const value of ["buyer_profiles", "buyer_profile_criteria", "lead_property_shortlists", "lead_property_shortlist_items"]) {
    assert.match(route, new RegExp(value));
  }
  assert.match(route, /\.eq\("status", "approved"\)/);
  assert.match(route, /evaluateBuyerProfileHealth/);
  assert.match(route, /evaluateMatchQuality/);
});
