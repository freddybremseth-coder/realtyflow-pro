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
      quarantined: 0,
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

test("quarantine remains a human-required safety action", () => {
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

  assert.equal(actions[0]?.kind, "REVIEW_QUARANTINE");
  assert.equal(actions[0]?.execution, "HUMAN_REQUIRED");
  assert.equal(actions[0]?.priority, "HIGH");
});

test("known canary route lookup remains explicit and deny-by-default", () => {
  assert.equal(controlledCanaryRoute("pinosoecolife", "facebook"), "/marketing-canary-pinoso-facebook");
  assert.equal(controlledCanaryRoute("pinosoecolife", "youtube"), null);
});
