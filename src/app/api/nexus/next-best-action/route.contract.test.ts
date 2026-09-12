import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/nexus/next-best-action/route.ts", "utf8");

test("Next Best Action loads the saved Revenue Learning profile before ranking", () => {
  assert.match(source, /NEXUS_REVENUE_LEARNING_SETTINGS_KEY/);
  assert.match(source, /parseRevenueLearningProfile/);
  assert.match(source, /from\("brand_settings"\)/);
  assert.match(source, /buildRevenueBrain\(command, 25, learningProfile\)/);
});

test("Next Best Action keeps learned ranking separate from execution policy", () => {
  assert.match(source, /policyRegistryStillAuthoritative: true/);
  assert.match(source, /revenueLearningCanChangePolicy: false/);
  assert.match(source, /communicationLearningCanChangePolicy: false/);
  assert.match(source, /recommendationOnly: true/);
  assert.match(source, /automaticSending: false/);
  assert.match(source, /automaticApproval: false/);
});

test("Next Best Action exposes learning observability without granting autonomy", () => {
  assert.match(source, /revenueProfileLoaded: Boolean\(learningProfile\)/);
  assert.match(source, /revenueActionsAdjusted: brain\.summary\.learningAdjusted/);
  assert.match(source, /communicationRulesLoaded: communicationRules\.length/);
});
