import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20261005214500_corporate_intelligence_v2.sql", "utf8");
const engine = fs.readFileSync("src/lib/corporate-intelligence.ts", "utf8");
const runner = fs.readFileSync("src/lib/corporate-intelligence-runner.ts", "utf8");
const accountCron = fs.readFileSync("src/app/api/cron/corporate-intelligence-accounts/route.ts", "utf8");
const watchCron = fs.readFileSync("src/app/api/cron/corporate-intelligence-watch/route.ts", "utf8");
const workspaceApi = fs.readFileSync("src/app/api/workspaces/[brandKey]/corporate/[prospectId]/route.ts", "utf8");
const workspacePage = fs.readFileSync("src/app/(realty)/workspace/[brandKey]/corporate/[prospectId]/page.tsx", "utf8");
const registry = fs.readFileSync("src/lib/automation/registry.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

test("Corporate Intelligence storage is source-backed and service-role only", () => {
  assert.match(migration, /create table if not exists public\.corporate_intelligence_runs/);
  assert.match(migration, /create table if not exists public\.corporate_intelligence_findings/);
  assert.match(migration, /change_status.*NEW.*CHANGED.*UNCHANGED/s);
  assert.match(migration, /fit_delta/);
  assert.match(migration, /timing_delta/);
  assert.match(migration, /intent_delta/);
  assert.match(migration, /financial_capacity_delta/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.corporate_intelligence_findings from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.corporate_intelligence_findings to service_role/);
});

test("Corporate Intelligence implements account, market, regulatory and change-detection paths", () => {
  assert.match(engine, /runAccountDeepResearch/);
  assert.match(engine, /runCorporateWatch/);
  assert.match(engine, /"MARKET"/);
  assert.match(engine, /"REGULATORY"/);
  assert.match(engine, /findingFingerprint/);
  assert.match(engine, /findingContentHash/);
  assert.match(engine, /changeStatus = !existing \? "NEW"/);
  assert.match(engine, /existing\.content_hash === nextHash \? "UNCHANGED" : "CHANGED"/);
  assert.match(engine, /researchWeb/);
  assert.match(engine, /sourceAuthority/);
  assert.match(engine, /whyItMatters/);
});

test("Corporate Intelligence automation is bounded and never performs outreach or pipeline movement", () => {
  assert.match(runner, /CORPORATE_INTELLIGENCE_ACCOUNT_BATCH = 3/);
  assert.match(runner, /ACCOUNT_TTL_MS = 7/);
  assert.match(runner, /outreachStarted: false/);
  assert.match(runner, /pipelineMoved: false/);
  assert.doesNotMatch(runner, /sendEmail\s*\(|sendMessage\s*\(|publish[A-Z_a-z0-9]*\s*\(/);
  assert.match(accountCron, /evaluateCronSafeMode/);
  assert.match(watchCron, /evaluateCronSafeMode/);
});

test("Corporate Intelligence is scheduled and registered", () => {
  assert.match(vercel, /\/api\/cron\/corporate-intelligence-watch/);
  assert.match(vercel, /50 5 \* \* \*/);
  assert.match(vercel, /\/api\/cron\/corporate-intelligence-accounts/);
  assert.match(vercel, /45 6 \* \* \*/);
  assert.match(registry, /Corporate Intelligence market\/regulatory watch/);
  assert.match(registry, /Corporate Intelligence account deep research/);
});

test("Corporate Account Workspace exposes manual deep research and source links without side effects", () => {
  assert.match(workspaceApi, /action === "run_intelligence"/);
  assert.match(workspaceApi, /runAccountDeepResearch/);
  assert.match(workspaceApi, /externalAction: false/);
  assert.match(workspaceApi, /outreachStarted: false/);
  assert.match(workspaceApi, /pipelineMoved: false/);
  assert.match(workspacePage, /Corporate Intelligence/);
  assert.match(workspacePage, /Kjør dyp research/);
  assert.match(workspacePage, /Markedswatch/);
  assert.match(workspacePage, /Regelverkswatch/);
  assert.match(workspacePage, /why_it_matters/);
  assert.match(workspacePage, /source_url/);
});


test("Account Deep Research preserves authoritative prospect fields before rescoring", () => {
  assert.match(engine, /organization_type,country_code,website_url,industry,employee_count,employee_band,member_count,decision_roles,source_url,evidence/);
  assert.match(engine, /rescoreCorporateProspect\(\{ \.\.\.company, evidence: nextEvidence \}\)/);
});

test("Own-site event signals are temporally weighted instead of treated as automatically fresh", () => {
  assert.match(engine, /EVENT_SIGNALS/);
  assert.match(engine, /event_year/);
  assert.match(engine, /freshness: age === 0 \? 92/);
  assert.match(engine, /Historisk signal; brukes som kontekst/);
  assert.match(engine, /Ekstern webresearch leverte ikke data/);
});
