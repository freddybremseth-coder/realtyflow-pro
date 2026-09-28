import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const layout = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
const component = fs.readFileSync(path.join(process.cwd(), "src/components/layout/daily-spanish-nudge.tsx"), "utf8");
const daily = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/spanish/daily/route.ts"), "utf8");
const callback = fs.readFileSync(path.join(process.cwd(), "src/app/api/integrations/spanish-learning/progress/route.ts"), "utf8");
const helper = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/spanish-learning.ts"), "utf8");

test("daily Spanish nudge is global and owner-backed", () => {
  assert.match(layout, /DailySpanishNudge/);
  assert.match(component, /5 minutter spansk/);
  assert.match(component, /\/api\/personal-intelligence\/spanish\/daily/);
  assert.match(daily, /access\.role !== "OWNER"/);
});

test("Spanish launch carries adaptive focus and secure progress callback", () => {
  assert.match(daily, /mode", "daily5"/);
  assert.match(daily, /minutes", "5"/);
  assert.match(daily, /progress_callback/);
  assert.match(daily, /progress_token/);
  assert.match(helper, /createHmac/);
  assert.match(helper, /timingSafeEqual/);
});

test("Spanish callback is origin-scoped and does not manufacture mastery", () => {
  assert.match(callback, /https:\/\/spanish\.chatgenius\.pro/);
  assert.match(callback, /verifySpanishProgressToken/);
  assert.doesNotMatch(callback, /knowledge.*mastery/i);
  assert.match(callback, /weakAreas/);
  assert.match(callback, /nextFocus/);
});
