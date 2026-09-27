import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Corporate growth review cron is read-only decision support", () => {
  const source = fs.readFileSync("src/app/api/cron/corporate-homes-growth-review/route.ts", "utf8");
  assert.match(source, /requireCronApi/);
  assert.match(source, /evaluateCronSafeMode/);
  assert.match(source, /corporate_homes_growth_review/);
  assert.match(source, /revenue_events/);
  assert.match(source, /corporate_prospects/);
  assert.match(source, /automaticBudgetChanges: false/);
  assert.match(source, /automaticOutreach: false/);
  assert.doesNotMatch(source, /sendEmail|sendMessage|publishPost|updateCampaignBudget|createReservation|initiatePayment/);
});
