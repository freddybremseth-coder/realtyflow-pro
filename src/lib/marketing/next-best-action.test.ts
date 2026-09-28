import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMarketingNextActions,
  controlledCanaryRoute,
  marketingSurfaceKind,
} from "@/lib/marketing/next-best-action";

test("classifies Search Console as a signal instead of a publishing destination", () => {
  assert.equal(marketingSurfaceKind("google_search_console"), "signal");
  assert.equal(marketingSurfaceKind("instagram"), "destination");
});

test("chooses a generic same-brand canary from an existing live-learning control channel", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "instagram",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 31,
      measuredEligible: 17,
      quarantined: 14,
      evaluatedRules: 97,
      actionableRules: 16,
      liveLearning: true,
      surfaceKind: "destination",
    },
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "facebook",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 17,
      measuredEligible: 0,
      quarantined: 0,
      evaluatedRules: 0,
      actionableRules: 0,
      liveLearning: false,
      surfaceKind: "destination",
    },
  ]);

  const canary = actions.find((action) => action.kind === "PREPARE_CANARY");
  assert.ok(canary);
  assert.equal(canary.brandId, "zeneco");
  assert.equal(canary.channel, "facebook");
  assert.equal(canary.sourceChannel, "instagram");
  assert.equal(canary.execution, "AUTO_READY");
  assert.equal(canary.href, "/marketing-canary-facebook");
});

test("does not turn measurement signals into human attention work", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "google_search_console",
      connected: true,
      brandBrainReady: true,
      planned: false,
      pilotReady: false,
      published: 0,
      measuredEligible: 0,
      quarantined: 0,
      evaluatedRules: 0,
      actionableRules: 0,
      liveLearning: false,
      surfaceKind: "signal",
    },
  ]);

  assert.deepEqual(actions, []);
});

test("excluded metric quarantine is system hygiene while clean learning remains usable", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "instagram",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 20,
      measuredEligible: 12,
      quarantined: 2,
      evaluatedRules: 12,
      actionableRules: 3,
      liveLearning: true,
      surfaceKind: "destination",
    },
  ]);

  const quarantine = actions.find((action) => action.kind === "REVIEW_QUARANTINE");
  const optimize = actions.find((action) => action.kind === "OPTIMIZE_WITH_LEARNING");
  assert.ok(quarantine);
  assert.equal(quarantine.execution, "SYSTEM_WORK");
  assert.equal(quarantine.priority, "LOW");
  assert.ok(optimize);
  assert.equal(optimize.execution, "SYSTEM_WORK");
});

test("known canary route lookup remains explicit and deny-by-default", () => {
  assert.equal(controlledCanaryRoute("pinosoecolife", "facebook"), "/marketing-canary-pinoso-facebook");
  assert.equal(controlledCanaryRoute("pinosoecolife", "youtube"), null);
});


test("learning evaluation is system work because metrics sync refreshes rules automatically", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "instagram",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 12,
      measuredEligible: 10,
      quarantined: 0,
      evaluatedRules: 0,
      actionableRules: 0,
      liveLearning: false,
      surfaceKind: "destination",
    },
  ]);

  const evaluation = actions.find((action) => action.kind === "RUN_LEARNING_EVALUATION");
  assert.ok(evaluation);
  assert.equal(evaluation.execution, "SYSTEM_WORK");
  assert.match(evaluation.reason, /automatically|automatisk/i);
});


test("reliable attributed business outcomes raise live-learning optimization priority", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "instagram",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 24,
      measuredEligible: 16,
      quarantined: 0,
      evaluatedRules: 20,
      actionableRules: 5,
      liveLearning: true,
      surfaceKind: "destination",
    },
  ], 10, [{
    brandId: "zeneco",
    channel: "instagram",
    unifiedScore: 71,
    attributionCoveragePct: 82,
    evidence: "reliable",
    leads: 4,
    qualifiedLeads: 2,
    sales: 1,
    commissionEur: 18000,
  }]);

  const optimize = actions.find((action) => action.kind === "OPTIMIZE_WITH_LEARNING");
  assert.ok(optimize);
  assert.equal(optimize.priority, "HIGH");
  assert.equal(optimize.business?.trustedForPriority, true);
  assert.match(optimize.reason, /business-evidens/i);
  assert.match(optimize.reason, /1 salg/);
});

test("weak attribution remains visible but cannot steer priority", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "instagram",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 24,
      measuredEligible: 16,
      quarantined: 0,
      evaluatedRules: 20,
      actionableRules: 5,
      liveLearning: true,
      surfaceKind: "destination",
    },
  ], 10, [{
    brandId: "zeneco",
    channel: "instagram",
    unifiedScore: 90,
    attributionCoveragePct: 20,
    evidence: "strong",
    leads: 8,
    qualifiedLeads: 4,
    sales: 2,
    commissionEur: 40000,
  }]);

  const optimize = actions.find((action) => action.kind === "OPTIMIZE_WITH_LEARNING");
  assert.ok(optimize);
  assert.equal(optimize.priority, "MEDIUM");
  assert.equal(optimize.business?.trustedForPriority, false);
  assert.doesNotMatch(optimize.reason, /business-evidens/i);
});

test("business outcomes never bypass publishing governance", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "zeneco",
      brandName: "Zen Eco Homes",
      platform: "youtube",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: false,
      published: 30,
      measuredEligible: 20,
      quarantined: 0,
      evaluatedRules: 30,
      actionableRules: 10,
      liveLearning: false,
      surfaceKind: "destination",
    },
  ], 10, [{
    brandId: "zeneco",
    channel: "youtube",
    unifiedScore: 99,
    attributionCoveragePct: 100,
    evidence: "strong",
    leads: 20,
    qualifiedLeads: 10,
    sales: 5,
    commissionEur: 100000,
  }]);

  assert.equal(actions.some((action) => action.execution === "AUTO_READY"), false);
  const governance = actions.find((action) => action.kind === "ENABLE_PUBLISHING_GOVERNANCE");
  assert.ok(governance);
  assert.equal(governance.execution, "SYSTEM_WORK");
});

test("cross-channel canary prefers trusted business-proven learning source", () => {
  const actions = buildMarketingNextActions([
    {
      brandId: "pinosoecolife",
      brandName: "Pinoso EcoLife",
      platform: "facebook",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 3,
      measuredEligible: 2,
      quarantined: 0,
      evaluatedRules: 0,
      actionableRules: 0,
      liveLearning: false,
      surfaceKind: "destination",
    },
    {
      brandId: "pinosoecolife",
      brandName: "Pinoso EcoLife",
      platform: "instagram",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 20,
      measuredEligible: 12,
      quarantined: 0,
      evaluatedRules: 8,
      actionableRules: 2,
      liveLearning: true,
      surfaceKind: "destination",
    },
    {
      brandId: "pinosoecolife",
      brandName: "Pinoso EcoLife",
      platform: "youtube",
      connected: true,
      brandBrainReady: true,
      planned: true,
      pilotReady: true,
      published: 25,
      measuredEligible: 15,
      quarantined: 0,
      evaluatedRules: 30,
      actionableRules: 12,
      liveLearning: true,
      surfaceKind: "destination",
    },
  ], 10, [
    {
      brandId: "pinosoecolife",
      channel: "instagram",
      unifiedScore: 65,
      attributionCoveragePct: 90,
      evidence: "reliable",
      leads: 3,
      qualifiedLeads: 2,
      sales: 1,
      commissionEur: 12000,
    },
    {
      brandId: "pinosoecolife",
      channel: "youtube",
      unifiedScore: 80,
      attributionCoveragePct: 30,
      evidence: "strong",
      leads: 10,
      qualifiedLeads: 5,
      sales: 2,
      commissionEur: 30000,
    },
  ]);

  const canary = actions.find((action) => action.kind === "PREPARE_CANARY" && action.channel === "facebook");
  assert.ok(canary);
  assert.equal(canary.sourceChannel, "instagram");
  assert.equal(canary.priority, "HIGH");
  assert.equal(canary.business?.trustedForPriority, true);
});
