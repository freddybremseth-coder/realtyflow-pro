import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const overview = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/outbound-engagement/route.ts"),
  "utf8",
);
const draftRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/outbound-engagement/draft/route.ts"),
  "utf8",
);
const draftService = fs.readFileSync(
  path.join(process.cwd(), "src/lib/outbound-engagement/draft-preparation.ts"),
  "utf8",
);
const autoRunner = fs.readFileSync(
  path.join(process.cwd(), "src/lib/outbound-engagement/auto-draft-runner.ts"),
  "utf8",
);
const cronRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/outbound-draft-prep/route.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260930220500_outbound_engagement_autonomy.sql"),
  "utf8",
);
const runtimeMigration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260930223000_outbound_auto_draft_runtime.sql"),
  "utf8",
);

test("outbound overview and manual draft routes require admin", () => {
  assert.match(overview, /requireAdminApi\(request\)/);
  assert.match(draftRoute, /requireAdminApi\(request\)/);
  assert.match(draftRoute, /prepareOutboundDraft/);
});

test("shared draft preparation is evidence gated and cannot claim execution", () => {
  assert.match(draftService, /Official company contact channel must be researched before drafting/);
  assert.match(draftService, /Documented fit\/signal basis is required before automatic outreach drafting/);
  assert.match(draftService, /company_level_only/);
  assert.match(draftService, /personal_data_collected/);
  assert.match(draftService, /send_executed: false/);
  assert.match(draftService, /external_action_executed: false/);
  assert.match(draftService, /cold_send_allowed: false/);
  assert.match(draftService, /status: "REVIEW"/);
  assert.match(draftService, /This is a DRAFT only\. Do not imply it was sent/);
});

test("auto draft prep is cron protected, bounded and draft-only", () => {
  assert.match(cronRoute, /requireCronApi\(request\)/);
  assert.match(cronRoute, /evaluateCronSafeMode\(OUTBOUND_AUTO_DRAFT_PATH\)/);
  assert.match(autoRunner, /OUTBOUND_AUTO_DRAFT_BATCH = 3/);
  assert.match(autoRunner, /String\(policy\.mode\) !== "auto"/);
  assert.match(autoRunner, /daily policy limit reached/);
  assert.match(autoRunner, /send_executed: false/);
  assert.match(autoRunner, /external_action_executed: false/);
  assert.match(autoRunner, /cold_send_allowed: false/);
  assert.doesNotMatch(autoRunner, /sendMail|sendEmail|messages\.send|publish/);
});

test("runtime control describes internal review-only behavior", () => {
  assert.match(runtimeMigration, /cron:\/api\/cron\/outbound-draft-prep/);
  assert.match(runtimeMigration, /"max_per_run":3/);
  assert.match(runtimeMigration, /"send":false/);
  assert.match(runtimeMigration, /Ingen ekstern sending eller DM utføres/);
});

test("autonomy migration expands safe preparation without enabling cold or mass outreach", () => {
  assert.match(migration, /'company_research', 'auto'/);
  assert.match(migration, /'official_channel_discovery', 'auto'/);
  assert.match(migration, /'outreach_draft', 'auto'/);
  assert.match(migration, /'warm_signal_dm', 'approval'/);
  assert.match(migration, /'external_comment_post', 'approval'/);
  assert.match(migration, /'cold_promotional_email', 'blocked'/);
  assert.match(migration, /'mass_engagement', 'blocked'/);
  assert.doesNotMatch(migration, /'cold_social_dm',\s*'auto'/);
});
