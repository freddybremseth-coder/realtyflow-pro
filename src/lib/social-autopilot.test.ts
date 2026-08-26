import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeSocialAutopilot } from "@/lib/social-autopilot";

test("summary counts blockers and quarantine conservatively", () => {
  const summary = summarizeSocialAutopilot([
    { brandId: "a", brandName: "A", platform: "instagram", connected: true, pilotReady: false, pilotBlockReason: "Missing token", published: 3, measuredEligible: 2, quarantined: 1, liveLearning: false },
    { brandId: "b", brandName: "B", platform: "facebook", connected: true, pilotReady: true, pilotBlockReason: null, published: 4, measuredEligible: 4, quarantined: 0, liveLearning: true },
  ]);

  assert.equal(summary.connected, 2);
  assert.equal(summary.pilotReady, 1);
  assert.equal(summary.published, 7);
  assert.equal(summary.blockers.length, 1);
  assert.equal(summary.needsAttention, 2);
});
