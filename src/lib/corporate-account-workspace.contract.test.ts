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
const strategyCoachMigration = fs.readFileSync(
  "supabase/migrations/20261005193000_corporate_account_strategy_sales_coach.sql",
  "utf8",
);
const salesCoach = fs.readFileSync(
  "src/lib/nexus/corporate-sales-coach.ts",
  "utf8",
);
const api1881 = fs.readFileSync(
  "src/lib/corporate-enrichment/api1881.ts",
  "utf8",
);
const brreg = fs.readFileSync(
  "src/lib/corporate-enrichment/brreg.ts",
  "utf8",
);
const companyProfile = fs.readFileSync(
  "src/lib/corporate-enrichment/company-profile.ts",
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


test("1881 enrichment supports the current subscription-key contract with legacy fallback and does not create people automatically", () => {
  assert.match(api1881, /https:\/\/services\.api1881\.no/);
  assert.match(api1881, /https:\/\/api\.1881\.no\/search\/v1/);
  assert.match(api1881, /API1881_SUBSCRIPTION_KEY/);
  assert.match(api1881, /API_1881_SECRET/);
  assert.match(api1881, /Ocp-Apim-Subscription-Key/);
  assert.match(api1881, /X-VK1881-API-CLIENT/);
  assert.match(api1881, /VK1881Identity/);
  assert.match(api1881, /\/lookup\/organizationnumber\//);
  assert.match(api1881, /\/search\/unit\?query=/);
  assert.match(api1881, /\/lookup\/phonenumber\//);
  assert.match(api1881, /\/company\/\?querystring=/);
  assert.match(api1881, /automaticPersonCreation:\s*false/);
  assert.match(api1881, /automaticOutreach:\s*false/);
  assert.match(route, /action === "enrich_1881"/);
  assert.match(route, /automaticPersonCreation:\s*false/);
  assert.match(route, /1881 svarte HTTP/);
});


test("Corporate enrichment surfaces 1881 values and free Brønnøysund roles without auto-creating people", () => {
  assert.match(route, /action === "enrich_brreg"/);
  assert.match(route, /fetchBrregCompanySnapshot/);
  assert.match(route, /buildCorporateEnrichmentProfile/);
  assert.match(brreg, /\/enheter\/\$\{encodeURIComponent\(orgnr\)\}\/roller/);
  assert.match(companyProfile, /contactPoints/);
  assert.match(companyProfile, /rollegrupper/);
  assert.match(companyProfile, /verified:\s*sources\.length > 1/);
  assert.match(page, /Oppdater Brønnøysund/);
  assert.match(page, /bruker 1 søk/);
  assert.match(page, /Offentlige roller/);
  assert.match(page, /Legg til/);
  assert.doesNotMatch(companyProfile, /birthDate:\s/);
});


test("Corporate ownership uses active system users and defaults to the primary RealtyFlow owner", () => {
  assert.match(route, /getAdminEmails/);
  assert.match(route, /workspace_user_admin_snapshot/);
  assert.match(route, /membership\.permissions/);
  assert.doesNotMatch(route, /schema\("core"\)\.from\("brand_workspace_memberships"\)/);
  assert.doesNotMatch(route, /schema\("core"\)\.from\("workspace_user_directory"\)/);
  assert.match(route, /corporate\.read/);
  assert.match(route, /corporate\.plan/);
  assert.match(route, /defaultOwnerEmail/);
  assert.match(route, /INVALID_ACCOUNT_OWNER/);
  assert.match(page, /Account owner/);
  assert.match(page, /Strategisk ansvarlig/);
  assert.match(page, /data\.assignmentOptions\.users\.map/);
  assert.match(page, /Nye kontoer får RealtyFlow Owner som standard/);
  assert.doesNotMatch(page, /placeholder="Account owner e-post"/);
  assert.doesNotMatch(page, /placeholder="Strategisk ansvarlig e-post"/);
});


test("Corporate Account Strategy v2 separates pipeline, priority, account role and sales motion", () => {
  assert.match(strategyCoachMigration, /account_role/);
  assert.match(strategyCoachMigration, /problem_hypothesis/);
  assert.match(strategyCoachMigration, /problem_acceptance_goal/);
  assert.match(strategyCoachMigration, /solution_hypothesis/);
  assert.match(strategyCoachMigration, /solution_acceptance_goal/);
  assert.match(strategyCoachMigration, /next_best_action/);
  assert.match(page, /Account score/);
  assert.match(page, /Timing/);
  assert.match(page, /Access/);
  assert.match(page, /Intent/);
  assert.match(page, /Referral partner er nå en kontorolle/);
  assert.match(page, /Business case completeness/);
});

test("Nexus Sales Coach follows problem-to-solution acceptance and never auto-sends", () => {
  assert.match(strategyCoachMigration, /create table if not exists public\.corporate_sales_coach_runs/);
  assert.match(strategyCoachMigration, /revoke all on table public\.corporate_sales_coach_runs from public, anon, authenticated/);
  assert.match(route, /action === "sales_coach"/);
  assert.match(route, /runCorporateSalesCoach/);
  assert.match(route, /emailSent:\s*false/);
  assert.match(route, /linkedinMessageSent:\s*false/);
  assert.match(salesCoach, /DISCOVER_PROBLEM/);
  assert.match(salesCoach, /CONFIRM_PROBLEM/);
  assert.match(salesCoach, /PRESENT_SOLUTION/);
  assert.match(salesCoach, /CONFIRM_SOLUTION/);
  assert.match(salesCoach, /NEXT_COMMITMENT/);
  assert.match(salesCoach, /Du skal ikke bruke manipulasjon, press, falsk knapphet/);
  assert.match(page, /Nexus AI Sales Coach/);
  assert.match(page, /Analyser e-post og foreslå svar/);
  assert.match(page, /Utkastet er ikke sendt/);
});


test("Sales Coach can hand a draft to E-post Reach without supplying a browser recipient address", () => {
  assert.match(page, /saveCoachEmailDraft/);
  assert.match(page, /\/api\/workspaces\/\$\{encodeURIComponent\(brandKey\)\}\/email/);
  assert.match(page, /targetType:\s*"corporate"/);
  assert.match(page, /targetId:\s*prospectId/);
  assert.match(page, /Lagre i E-post \/ Reach/);
  assert.match(page, /Ingenting sendes uten eksplisitt handling/);
  assert.doesNotMatch(page, /recipientEmail:\s*coachOutput/);
});

test("Sales Coach recommendation can be promoted into strategy fields only by explicit seller action", () => {
  assert.match(page, /applyCoachRecommendation/);
  assert.match(page, /nextBestAction:\s*next \|\| current\.nextBestAction/);
  assert.match(page, /problemHypothesis:\s*problem \|\| current\.problemHypothesis/);
  assert.match(page, /solutionHypothesis:\s*solution \|\| current\.solutionHypothesis/);
  assert.match(page, /Trykk «Lagre strategi» for å gjøre endringen varig/);
});
