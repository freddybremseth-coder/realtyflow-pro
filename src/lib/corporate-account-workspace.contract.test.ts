import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  "src/app/api/workspaces/[brandKey]/corporate/[prospectId]/route.ts",
  "utf8",
);
const page = fs.readFileSync(
  "src/app/(realty)/workspace/[brandKey]/corporate/[prospectId]/page.tsx",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20261004213000_corporate_account_workspace.sql",
  "utf8",
);

test("Corporate Account Workspace is permission scoped and never auto-executes outreach", () => {
  assert.match(route, /requireBrandWorkspace\(request, params\.brandKey, "corporate\.read"\)/);
  assert.match(route, /requireBrandWorkspace\(request, params\.brandKey, "corporate\.plan"\)/);
  assert.match(route, /emailSent:\s*false/);
  assert.match(route, /linkedinMessageSent:\s*false/);
  assert.match(route, /externalAction:\s*false/);
  assert.doesNotMatch(route, /sendEmail\(|sendMessage\(|nodemailer|linkedin.*api/i);
});

test("LinkedIn is modeled as a governed relationship channel, not a scraper", () => {
  assert.match(route, /manual_relationship_channel/);
  assert.match(route, /scraping:\s*false/);
  assert.match(route, /arbitraryProfileApiEnrichment:\s*false/);
  assert.match(page, /LinkedIn: manuell godkjenning/);
  assert.match(page, /automatisk profilscraping/);
});

test("Corporate account tables are server-only and support strategy, touchpoints and enrichment evidence", () => {
  assert.match(migration, /create table if not exists public\.corporate_account_strategies/);
  assert.match(migration, /create table if not exists public\.corporate_account_touchpoints/);
  assert.match(migration, /create table if not exists public\.corporate_account_enrichment/);
  assert.match(migration, /revoke all on table public\.corporate_account_strategies from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.corporate_account_strategies to service_role/);
  assert.match(migration, /professional_topics/);
  assert.match(migration, /Do not infer or store sensitive\/private interests/);
});
