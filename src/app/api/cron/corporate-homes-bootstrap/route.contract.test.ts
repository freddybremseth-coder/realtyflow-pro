import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/cron/corporate-homes-bootstrap/route.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const registry = fs.readFileSync("src/lib/automation/registry.ts", "utf8");

test("Corporate Homes bootstrap runs hourly until the first batch exists", () => {
  assert.match(vercel, /\/api\/cron\/corporate-homes-bootstrap/);
  assert.match(vercel, /25 \* \* \* \*/);
  assert.match(route, /current > 0/);
  assert.match(route, /bootstrap_complete/);
  assert.match(registry, /Corporate Homes first batch/);
});

test("Corporate Homes bootstrap imports only public company-level data through governed discovery", () => {
  assert.match(route, /runCorporateHomesDiscovery/);
  assert.match(route, /brreg_open_data_bootstrap/);
  assert.match(route, /batchSize:\s*25/);
  assert.doesNotMatch(route, /corporate_prospect_contacts|sendEmail|email_messages|email_drafts/);
});
