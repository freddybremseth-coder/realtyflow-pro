import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminRoute = fs.readFileSync("src/app/api/corporate-homes/discovery/run/route.ts", "utf8");
const cronRoute = fs.readFileSync("src/app/api/cron/corporate-homes-discovery/route.ts", "utf8");
const runner = fs.readFileSync("src/lib/corporate-homes-discovery-runner.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/prospects/page.tsx", "utf8");

test("Corporate Homes run-now endpoint is admin-only and respects Nexus safe mode", () => {
  assert.match(adminRoute, /requireAdminApi/);
  assert.match(adminRoute, /evaluateCronSafeMode\(CORPORATE_DISCOVERY_PATH\)/);
  assert.match(adminRoute, /runCorporateHomesDiscovery/);
});

test("Shared discovery runner preserves target, A-B fit and no-outreach boundaries", () => {
  assert.match(runner, /CORPORATE_PROSPECT_TARGET/);
  assert.match(runner, /\["A", "B"\]/);
  assert.match(runner, /personal_contact_enrichment:\s*false/);
  assert.match(runner, /outreach_started:\s*false/);
  assert.doesNotMatch(runner, /corporate_prospect_contacts|sendEmail|email_messages|email_drafts/);
});

test("Cron and manual discovery use the same governed runner", () => {
  assert.match(cronRoute, /runCorporateHomesDiscovery/);
  assert.match(adminRoute, /runCorporateHomesDiscovery/);
  assert.match(page, /Kjør discovery nå/);
  assert.match(page, /Autopilot:/);
});
