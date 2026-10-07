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
const learningLoopMigration = fs.readFileSync(
  "supabase/migrations/20261005215000_corporate_sales_learning_loop.sql",
  "utf8",
);
const stageGate = fs.readFileSync(
  "src/lib/nexus/corporate-sales-stage-gate.ts",
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
const growthPanel = fs.readFileSync(
  "src/components/workspaces/growth-corporate-panel.tsx",
  "utf8",
);
const workspaceAccess = fs.readFileSync(
  "src/app/(realty)/workspace-access/page.tsx",
  "utf8",
);
const workspaceUsers = fs.readFileSync(
  "src/app/(realty)/workspace-users/page.tsx",
  "utf8",
);
const moduleCatalog = fs.readFileSync(
  "src/lib/workspaces/module-catalog.ts",
  "utf8",
);
const outboundEngagementPage = fs.readFileSync(
  "src/app/(content)/nexus-os/outbound-engagement/page.tsx",
  "utf8",
);
const corporateDashboard = fs.readFileSync(
  "src/app/(business)/corporate-homes/page.tsx",
  "utf8",
);
const corporatePartnersPage = fs.readFileSync(
  "src/app/(business)/corporate-homes/partners/page.tsx",
  "utf8",
);
const intelligenceEngine = fs.readFileSync(
  "src/lib/corporate-intelligence.ts",
  "utf8",
);
const accountAdvisor = fs.readFileSync(
  "src/lib/nexus/corporate-account-advisor.ts",
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
  assert.match(page, /Kontoansvarlig/);
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
  assert.match(page, /Kontoscore/);
  assert.match(page, /Tidspunkt/);
  assert.match(page, /Tilgang/);
  assert.match(page, /Kjøpssignal/);
  assert.match(page, /Henvisningspartner er en kontorolle/);
  assert.match(page, /Komplett beslutningsgrunnlag/);
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
  assert.match(page, /Nexus AI-salgscoach/);
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

test("Sales Coach recommendation can be promoted into strategy only by explicit audited seller action", () => {
  assert.match(page, /applyCoachRecommendation/);
  assert.match(page, /action:\s*"apply_coach_strategy"/);
  assert.match(page, /Godkjenn og bruk i kontostrategi/);
  assert.match(route, /action === "apply_coach_strategy"/);
  assert.match(route, /humanApproved:\s*true/);
  assert.match(route, /applied_fields/);
  assert.match(route, /externalAction:\s*false/);
  assert.match(page, /Faktisk problem- og løsningsaksept må registreres separat med dokumentasjon fra kunden/);
});

test("Corporate sales learning loop stores explicit customer acceptance separately from AI hypotheses", () => {
  assert.match(learningLoopMigration, /problem_acceptance_status/);
  assert.match(learningLoopMigration, /problem_acceptance_evidence/);
  assert.match(learningLoopMigration, /solution_acceptance_status/);
  assert.match(learningLoopMigration, /solution_acceptance_evidence/);
  assert.match(learningLoopMigration, /revoke all on table public\.corporate_sales_coach_runs from public, anon, authenticated/);
  assert.match(learningLoopMigration, /grant select, insert, update, delete on table public\.corporate_sales_coach_runs to service_role/);
  assert.match(page, /Faktisk problemaksept/);
  assert.match(page, /Faktisk løsningsaksept/);
});

test("Corporate phase gate requires evidence and a human reason for deliberate early advancement", () => {
  assert.match(stageGate, /problem_acceptance_status/);
  assert.match(stageGate, /solution_acceptance_status/);
  assert.match(stageGate, /readyToAdvance/);
  assert.match(stageGate, /completionPercent/);
  assert.match(route, /STAGE_GATE_NOT_READY/);
  assert.match(route, /stageOverrideReason\.length < 12/);
  assert.match(page, /Fasevakt/);
  assert.match(page, /Overstyr fasevakt/);
});


test("Corporate user-facing copy stays consistently Norwegian", () => {
  assert.match(page, /Bedriftskonto/);
  assert.match(page, /Nexus bedriftsrådgiver/);
  assert.match(page, /Bedriftsinnsikt/);
  assert.match(page, /BEGRENSET ANALYSE/);
  assert.match(page, /FULL ANALYSE/);
  assert.match(page, /Kontoscore/);
  assert.match(page, /Komplett beslutningsgrunnlag/);
  assert.match(page, /Beslutningsgruppe/);
  assert.match(page, /Nexus AI-salgscoach/);
  assert.doesNotMatch(page, /DEGRADED RESEARCH|FULL RESEARCH|Provider:|· freshness|· confidence|Account score|Decision Unit|Referral partner er nå en kontorolle|Business case completeness|Nexus AI Sales Coach|Henter Corporate Account Workspace/);

  assert.match(growthPanel, /Bedriftskartlegging \/ neste steg/);
  assert.match(growthPanel, /Bedrift og partnerkanaler/);
  assert.doesNotMatch(growthPanel, /Corporate research \/ neste steg|Forbered discovery-møte|Decision Pack|Aktiv pipeline|Laster Growth & Corporate/);

  assert.match(workspaceAccess, /Bedrift – se/);
  assert.match(workspaceAccess, /Bedrift – planlegge/);
  assert.match(workspaceUsers, /Kartlegge og planlegge neste steg/);
  assert.match(moduleCatalog, /label: "Bedrift"/);
  assert.doesNotMatch(outboundEngagementPage, /Corporate buyer|Tier \{row\.fitTier\}/);

  assert.match(corporateDashboard, /B2B-vekst og salgstrakt/);
  assert.match(corporateDashboard, /Bedriftshenvendelser/);
  assert.match(corporateDashboard, /Bedriftens innholdsmotor/);
  assert.doesNotMatch(corporateDashboard, /B2B Growth & Pipeline|Corporate leads|Aktiv pipeline|Corporate Content Engine|Signalresearch|Siste discovery:|partnerdiscovery/);
  assert.match(corporatePartnersPage, /Sikkerhetsregel:/);
  assert.doesNotMatch(corporatePartnersPage, /Guardrail:|partnerdiscovery|Åpne dossier/);

  assert.doesNotMatch(intelligenceEngine, /degraded research|webresearch|watch-kjøringen|Employer branding|People-\/|management-retreat/);
  assert.doesNotMatch(accountAdvisor, /Selskapsresearch|intern champion|videre outreach|tilgjengelig enrichment|offentlig research|kort discovery|active outreach|scrape profiler|inferer private/);
});
