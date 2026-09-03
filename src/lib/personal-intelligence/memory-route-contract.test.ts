import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const confirmRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/memory/confirm/route.ts"), "utf8");
const correctRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/memory/correct/route.ts"), "utf8");
const claimService = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/claim-service.ts"), "utf8");

test("memory persistence endpoints are owner-only", () => {
  assert.match(confirmRoute, /access\.role !== "OWNER"/);
  assert.match(correctRoute, /access\.role !== "OWNER"/);
});

test("confirmed memory binds a direct current user source before becoming canonical", () => {
  assert.match(claimService, /source_type: "direct_user_statement"/);
  assert.match(claimService, /reliability_class: "direct_current_user_confirmation"/);
  assert.match(claimService, /status: "canonical"/);
  assert.match(claimService, /confirmed_at: new Date\(\)\.toISOString\(\)/);
});

test("memory confirmation validates canonical subject ownership despite service role", () => {
  assert.match(confirmRoute, /\.eq\("id", subjectEntityId\)/);
  assert.match(confirmRoute, /\.eq\("owner_user_id", ownerUserId\)/);
});

test("memory correction is provenance-backed and cleans orphan source on failure", () => {
  assert.match(correctRoute, /reliability_class: "direct_current_user_correction"/);
  assert.match(correctRoute, /correctClaim\(supabase/);
  assert.match(correctRoute, /\.from\("sources"\)\.delete\(\)/);
});
