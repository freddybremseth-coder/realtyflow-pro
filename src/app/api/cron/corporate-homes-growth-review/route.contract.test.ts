import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Corporate growth review cron is read-only decision support", () => {
  const source = fs.readFileSync("src/app/api/cron/corporate-homes-growth-review/route.ts", "utf8");
  const schedule = fs.readFileSync("vercel.json", "utf8");
  const registry = fs.readFileSync("src/lib/automation/registry.ts", "utf8");
  const overview = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
  const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");
  assert.match(source, /requireCronApi/);
  assert.match(source, /evaluateCronSafeMode/);
  assert.match(source, /corporate_homes_growth_review/);
  assert.match(source, /revenue_events/);
  assert.match(source, /corporate_prospects/);
  assert.match(source, /automaticBudgetChanges: false/);
  assert.match(source, /automaticOutreach: false/);
  assert.doesNotMatch(source, /sendEmail|sendMessage|publishPost|updateCampaignBudget|createReservation|initiatePayment/);
  assert.match(schedule, /corporate-homes-growth-review/);
  assert.match(schedule, /30 7 \\* \\* 1/);
  assert.match(registry, /Corporate Homes Growth Review/);
  assert.match(registry, /ingen utsendelse, publisering eller automatisk budsjettendring/i);
  assert.match(overview, /corporate_homes_growth_review/);
  assert.match(page, /Ukentlig Growth Review/);
  assert.match(page, /Ingen automatisk spend-endring/);
});
