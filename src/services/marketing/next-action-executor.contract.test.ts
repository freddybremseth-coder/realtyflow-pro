import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const executor = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/next-action-executor.ts"), "utf8");
const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/marketing-autopilot/route.ts"), "utf8");
const campaign = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/campaign-production.ts"), "utf8");

test("next-action executor only queues controlled-auto canary preparation", () => {
  assert.match(executor, /eq\("status", "active"\)/);
  assert.match(executor, /eq\("autonomy_mode", "controlled_auto"\)/);
  assert.match(executor, /candidate\.kind === "PREPARE_CANARY"/);
  assert.match(executor, /candidate\.execution === "AUTO_READY"/);
  assert.match(executor, /marketing_autopilot_run_requests/);
  assert.match(executor, /nextActionRequestIdentity\(action\.id\)/);
});

test("executor has both publication and request cooldowns before enqueue", () => {
  assert.match(executor, /ACTION_COOLDOWN_HOURS = 20/);
  assert.match(executor, /RECENT_TARGET_PUBLICATION_EXISTS/);
  assert.match(executor, /RECENT_SYSTEM_CANARY_REQUEST_EXISTS/);
  assert.match(executor, /\["draft", "approved", "publishing", "published", "scheduled", "paused"\]/);
});

test("system canary widens generation only to registered pilot channels", () => {
  assert.match(route, /resolveAutopilotRunChannels\(/);
  assert.match(route, /systemNextAction: systemNextActionRun/);
  assert.match(route, /forcedRunForChannel/);
  assert.match(route, /!forcedRunForChannel && !isPlannedAutopilotDay/);
  assert.match(route, /!forcedRunForChannel && !shouldRunAutopilotSlot/);
});

test("review-only canary cannot silently become live through the request path", () => {
  assert.match(route, /nextActionPublicationMode/);
  assert.match(campaign, /autonomy\.preapprovedChannels\.has\(String\(brief\.channel\)\.toLowerCase\(\)\)/);
  assert.match(campaign, /preapprovedFormat/);
  assert.doesNotMatch(executor, /marketing_brand_growth_plans[\s\S]*\.update\(/);
});
