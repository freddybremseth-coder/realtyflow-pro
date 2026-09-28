import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const cron = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/seo-autopilot/route.ts"), "utf8");
const marketingCron = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/marketing-autopilot/route.ts"), "utf8");
const sourceRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/source-queue/route.ts"), "utf8");
const campaign = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/campaign-production.ts"), "utf8");

test("daily SAM cycle syncs measured GSC opportunities into the canonical source queue", () => {
  assert.match(cron, /syncSEOTopicMissions/);
  assert.match(cron, /measuredSnapshots/);
  assert.match(cron, /seo_topic_missions/);
});

test("Marketing Autopilot can prefer a ready SAM topic on Facebook without disabling normal guards", () => {
  assert.match(marketingCron, /loadSEOTopicSource/);
  assert.match(marketingCron, /seoTopicMasterIdea/);
  assert.match(marketingCron, /topic: seoTopicSource/);
  assert.match(marketingCron, /requiredCtaUrl: seoTopicSource\?\.source_url/);
  assert.match(marketingCron, /useInventoryProperty: role === "real_estate" && !seoTopicSource/);
  assert.match(marketingCron, /markSEOTopicSourcePlanned/);
});

test("manual Nexus source drafting carries the same topic and canonical URL", () => {
  assert.match(sourceRoute, /source\.source_type === "seo_topic"/);
  assert.match(sourceRoute, /genome_topic/);
  assert.match(sourceRoute, /requiredCtaUrl/);
  assert.match(sourceRoute, /canonical_url/);
});

test("campaign production enforces a verified https CTA after AI generation", () => {
  assert.match(campaign, /requiredCtaUrl\?: string/);
  assert.match(campaign, /REQUIRED_CTA_URL_INVALID/);
  assert.match(campaign, /Les mer: \$\{requiredUrl\}/);
  assert.match(campaign, /creative = dedupeCreativeCta\(creative\)/);
});
