import assert from "node:assert/strict";
import test from "node:test";
import { deriveLearningRules } from "./learning";
import { channelLearningScope } from "./learning-scope";
import type { ContentGenome } from "./genome";

const genome = (channel: "instagram" | "facebook"): ContentGenome => ({
  brandId: "zeneco",
  channel,
  format: "post",
  hookType: "price_first",
  ctaType: "book_call",
  goal: "lead_generation",
});

test("canonical learning scopes differ by channel", () => {
  assert.equal(channelLearningScope("zeneco", "instagram"), "zeneco:instagram");
  assert.equal(channelLearningScope("zeneco", "facebook"), "zeneco:facebook");
  assert.notEqual(channelLearningScope("zeneco", "instagram"), channelLearningScope("zeneco", "facebook"));
});

test("rule keys cannot collide across Instagram and Facebook scopes", () => {
  const observations = Array.from({ length: 5 }, () => ({
    genome: genome("instagram"),
    metrics: { views: 100, leads: 1 },
  }));

  const instagram = deriveLearningRules(observations, { scope: channelLearningScope("zeneco", "instagram") });
  const facebook = deriveLearningRules(observations.map((o) => ({ ...o, genome: genome("facebook") })), { scope: channelLearningScope("zeneco", "facebook") });

  const igHook = instagram.find((r) => r.dimension === "hookType" && r.value === "price_first");
  const fbHook = facebook.find((r) => r.dimension === "hookType" && r.value === "price_first");
  assert.ok(igHook);
  assert.ok(fbHook);
  assert.notEqual(igHook.ruleKey, fbHook.ruleKey);
  assert.equal(igHook.scope, "zeneco:instagram");
  assert.equal(fbHook.scope, "zeneco:facebook");
});
