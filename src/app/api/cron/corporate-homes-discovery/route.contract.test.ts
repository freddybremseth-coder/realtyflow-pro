import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/cron/corporate-homes-discovery/route.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const registry = fs.readFileSync("src/lib/automation/registry.ts", "utf8");

test("Corporate Homes discovery is scheduled daily and registered", () => {
  assert.match(vercel, /\/api\/cron\/corporate-homes-discovery/);
  assert.match(vercel, /10 6 \* \* 1/);
  assert.match(registry, /Corporate Homes discovery/);
});

test("Corporate Homes discovery uses public company data only and never starts outreach", () => {
  assert.match(route, /discoverBrregCandidates/);
  assert.match(route, /personal_contact_enrichment:\s*false/);
  assert.match(route, /outreach_started:\s*false/);
  assert.doesNotMatch(route, /email_drafts|email_messages|sendEmail|sendMessage|corporate_prospect_contacts/);
});

test("Corporate Homes discovery stops at the 250 prospect target and only imports A\/B fit", () => {
  assert.match(route, /CORPORATE_PROSPECT_TARGET/);
  assert.match(route, /WEEKLY_BATCH\s*=\s*25/);
  assert.match(route, /\["A",\s*"B"\]/);
});
