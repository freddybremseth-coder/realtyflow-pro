import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const overview = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/outbound-engagement/route.ts"),
  "utf8",
);
const draft = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/outbound-engagement/draft/route.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260930220500_outbound_engagement_autonomy.sql"),
  "utf8",
);

test("outbound overview and draft routes require admin", () => {
  assert.match(overview, /requireAdminApi\(request\)/);
  assert.match(draft, /requireAdminApi\(request\)/);
});

test("draft preparation is evidence gated and cannot claim execution", () => {
  assert.match(draft, /Official company contact channel must be researched before drafting/);
  assert.match(draft, /company_level_only/);
  assert.match(draft, /personal_data_collected/);
  assert.match(draft, /send_executed: false/);
  assert.match(draft, /external_action_executed: false/);
  assert.match(draft, /cold_send_allowed: false/);
  assert.match(draft, /status: "REVIEW"/);
  assert.match(draft, /This is a DRAFT only\. Do not imply it was sent/);
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
