import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260927070000_corporate_partner_channel.sql", "utf8");
const discovery = fs.readFileSync("src/lib/corporate-partner-discovery.ts", "utf8");
const runner = fs.readFileSync("src/lib/corporate-partner-discovery-runner.ts", "utf8");
const cron = fs.readFileSync("src/app/api/cron/corporate-homes-partner-discovery/route.ts", "utf8");
const overview = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");
const partnerPage = fs.readFileSync("src/app/(business)/corporate-homes/partners/page.tsx", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

test("Corporate partner queue is server-only and separate from buyer prospects", () => {
  assert.match(migration, /create table if not exists public\.corporate_partner_prospects/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.corporate_partner_prospects from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.corporate_partner_prospects to service_role/);
  assert.doesNotMatch(migration, /email text|phone text|linkedin_url text/);
});

test("Partner discovery uses public company data and never starts personal enrichment or outreach", () => {
  assert.match(discovery, /Brønnøysundregistrene/);
  assert.match(discovery, /naeringskode/);
  assert.match(discovery, /personal_enrichment_performed: false/);
  assert.match(runner, /personal_enrichment_started: false/);
  assert.match(runner, /outreach_started: false/);
  assert.doesNotMatch(discovery, /corporate_prospect_contacts|email|phone/);
});

test("Partner discovery is bounded and scheduled daily", () => {
  assert.match(discovery, /CORPORATE_PARTNER_TARGET = 100/);
  assert.match(discovery, /CORPORATE_PARTNER_DAILY_BATCH = 15/);
  assert.match(vercel, /\/api\/cron\/corporate-homes-partner-discovery/);
  assert.match(vercel, /25 6 \* \* \*/);
  assert.match(cron, /evaluateCronSafeMode/);
});

test("Corporate dashboard exposes the separate referral partner channel", () => {
  assert.match(overview, /corporate_partner_prospects/);
  assert.match(overview, /focusPartners/);
  assert.match(page, /Partnerkanal/);
  assert.match(page, /Finn flere partnerbedrifter/);
  assert.match(partnerPage, /Henvisningspartnere/);
  assert.match(partnerPage, /ingen personnavn/i);
});
