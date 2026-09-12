import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/marketing-autopilot/route.ts"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));

test("recent-publication guard covers every source type and fails closed", () => {
  const guard = route.slice(route.indexOf("async function hasRecentAutoPublication"), route.indexOf("async function markFailedControlledAutoPublications"));
  assert.doesNotMatch(guard, /source_type/);
  assert.match(guard, /RECENT_PUBLICATION_CHECK_FAILED/);
  assert.match(guard, /created_at/);
});

test("scheduled autopilot uses stable daily identity, history, and source cooldown", () => {
  assert.match(route, /autopilotRunIdentity\(brandId, channel, localDate, targetHour\)/);
  assert.match(route, /reuseCooldownDays:\s*14/);
  assert.match(route, /requirePublicationHistory:\s*true/);
  assert.match(route, /shouldRunAutopilotSlot\(localHour, targetHour\)/);
});

test("blocked real-estate AI copy recovers with same property and deterministic Inventory facts", () => {
  assert.match(route, /RECOVERABLE_PROPERTY_COPY_ERRORS/);
  assert.match(route, /item\.mode === "blocked"/);
  assert.match(route, /isRecoverablePropertyCopyError\(item\.error\)/);
  assert.match(route, /propertyId:\s*recoverable\.propertyId/);
  assert.match(route, /deterministicInventoryCopy:\s*true/);
  assert.match(route, /safeFallbackIdentity\(runIdentity\)/);
});

test("quality-policy blocks remain paused instead of being mislabeled provider failures", () => {
  const failureHandler = route.slice(route.indexOf("async function markFailedControlledAutoPublications"), route.indexOf("async function recordAutopilotHeartbeat"));
  assert.match(failureHandler, /item\.mode === "blocked"/);
  assert.match(failureHandler, /item\.state === "failed"/);
  assert.match(failureHandler, /quality\/policy block is not a provider failure/i);
  assert.doesNotMatch(failureHandler, /Boolean\(item\.error\).*\.update\(\{ state: "failed"/s);
});

test("Vercel invokes Marketing Autopilot hourly, not twelve times per hour", () => {
  const cron = vercel.crons.find((entry: any) => entry.path === "/api/cron/marketing-autopilot");
  assert.equal(cron?.schedule, "0 * * * *");
});
