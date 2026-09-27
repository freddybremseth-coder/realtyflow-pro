import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/lib/corporate-generic-contact-channel.ts", "utf8");
const runner = fs.readFileSync("src/lib/corporate-generic-contact-runner.ts", "utf8");
const cron = fs.readFileSync("src/app/api/cron/corporate-homes-generic-contacts/route.ts", "utf8");
const manual = fs.readFileSync("src/app/api/corporate-homes/generic-contacts/run/route.ts", "utf8");
const overview = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
const dashboard = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");
const prospect = fs.readFileSync("src/app/(business)/corporate-homes/prospects/[id]/page.tsx", "utf8");
const partner = fs.readFileSync("src/app/(business)/corporate-homes/partners/[id]/page.tsx", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const registry = fs.readFileSync("src/lib/automation/registry.ts", "utf8");

test("Company contact research is bounded to public same-company websites", () => {
  assert.match(source, /validatePublicWebsiteUrl/);
  assert.match(source, /sameCompanyHost/);
  assert.match(source, /MAX_REDIRECTS/);
  assert.match(source, /MAX_HTML_BYTES/);
  assert.match(source, /personal_data_collected: false/);
  assert.match(source, /outreach_started: false/);
});

test("Company contact runner stays company-level and bounded", () => {
  assert.match(runner, /CORPORATE_GENERIC_CONTACT_DAILY_BATCH = 10/);
  assert.match(runner, /fit_tier/);
  assert.match(runner, /generic_company_contact/);
  assert.match(runner, /personal_contact_enrichment: false/);
  assert.match(runner, /outreach_started: false/);
  assert.doesNotMatch(runner, /sendEmail\s*\(|sendMessage\s*\(|publish\s*\(/);
});

test("Company contact routes require controlled cron or admin access", () => {
  assert.match(cron, /requireCronApi/);
  assert.match(cron, /evaluateCronSafeMode/);
  assert.match(manual, /requireAdminApi/);
  assert.doesNotMatch(cron, /sendEmail\s*\(|sendMessage\s*\(/);
  assert.doesNotMatch(manual, /sendEmail\s*\(|sendMessage\s*\(/);
});

test("Company contact research is scheduled, registered and visible in Corporate UI", () => {
  assert.match(vercel, /\/api\/cron\/corporate-homes-generic-contacts/);
  assert.match(registry, /Corporate Homes company contacts/);
  assert.match(overview, /genericContacts/);
  assert.match(dashboard, /Selskapskontakt · uten personberikelse/);
  assert.match(prospect, /Offisiell selskapskontakt/);
  assert.match(partner, /Offisiell selskapskontakt/);
});

test("Company contact UI remains manual and draft-first", () => {
  assert.match(dashboard, /Ingen automatisk utsendelse|ingen utsendelse/i);
  assert.match(prospect, /Ingen automatisk utsendelse/);
  assert.match(partner, /Ingen automatisk utsendelse/);
  assert.doesNotMatch(dashboard, /sendEmail\s*\(|sendMessage\s*\(/);
});
