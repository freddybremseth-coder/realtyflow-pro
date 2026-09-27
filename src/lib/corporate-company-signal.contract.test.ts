import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const research = fs.readFileSync("src/lib/corporate-company-signals.ts", "utf8");
const runner = fs.readFileSync("src/lib/corporate-company-signal-runner.ts", "utf8");
const cron = fs.readFileSync("src/app/api/cron/corporate-homes-company-signals/route.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const bootstrap = fs.readFileSync("src/app/api/cron/corporate-homes-bootstrap/route.ts", "utf8");

test("Company signal research is SSRF guarded and same-host bounded", () => {
  assert.match(research, /validatePublicWebsiteUrl/);
  assert.match(research, /sameCompanyHost/);
  assert.match(research, /MAX_PAGES = 4/);
  assert.match(research, /redirect: "manual"/);
  assert.match(research, /personal_data_collected: false/);
  assert.doesNotMatch(research, /mailto:|tel:/);
});

test("Company signal runner is bounded and never starts person enrichment or outreach", () => {
  assert.match(runner, /CORPORATE_SIGNAL_RESEARCH_DAILY_BATCH = 8/);
  assert.match(runner, /RESEARCH_TTL_MS = 30/);
  assert.match(runner, /personal_data_collected: false/);
  assert.match(runner, /personal_contact_enrichment: false/);
  assert.match(runner, /outreach_started: false/);
  assert.doesNotMatch(runner, /corporate_prospect_contacts/);
});

test("Company signal research is scheduled behind safe mode and visible in the dashboard", () => {
  assert.match(vercel, /\/api\/cron\/corporate-homes-company-signals/);
  assert.match(vercel, /55 6 \* \* \*/);
  assert.match(cron, /evaluateCronSafeMode/);
  assert.match(page, /Undersøk selskaps-signaler/);
  assert.match(page, /Ingen personnavn, e-post eller telefon samles inn/);
});


test("Corporate bootstrap stages first partner and signal runs without outreach", () => {
  assert.match(bootstrap, /CORPORATE_PARTNER_DISCOVERY_ACTION/);
  assert.match(bootstrap, /CORPORATE_SIGNAL_RESEARCH_ACTION/);
  assert.match(bootstrap, /batchSize: 5/);
  assert.match(bootstrap, /batchSize: 2/);
  assert.match(bootstrap, /bootstrap_stage: "partners"/);
  assert.match(bootstrap, /bootstrap_stage: "company_signals"/);
  assert.match(bootstrap, /personal_enrichment_started: false/);
  assert.match(bootstrap, /outreach_started: false/);
  assert.doesNotMatch(bootstrap, /sendEmail|sendMessage|publish/);
});

test("Corporate bootstrap remains on the existing five-minute cadence", () => {
  assert.match(vercel, /\/api\/cron\/corporate-homes-bootstrap/);
  assert.match(vercel, /\*\/5 \* \* \* \*/);
});
