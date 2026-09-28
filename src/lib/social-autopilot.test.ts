import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeSocialAutopilot } from "@/lib/social-autopilot";

test("historical excluded metrics do not become human attention by themselves", () => {
  const summary = summarizeSocialAutopilot([
    { brandId: "a", brandName: "A", platform: "instagram", connected: true, pilotReady: false, pilotBlockReason: "Missing token", published: 3, measuredEligible: 2, quarantined: 1, liveLearning: false },
    { brandId: "b", brandName: "B", platform: "facebook", connected: true, pilotReady: true, pilotBlockReason: null, published: 4, measuredEligible: 4, quarantined: 0, liveLearning: true },
  ]);

  assert.equal(summary.connected, 2);
  assert.equal(summary.pilotReady, 1);
  assert.equal(summary.published, 7);
  assert.equal(summary.quarantined, 1);
  assert.equal(summary.blockers.length, 0);
  assert.equal(summary.needsAttention, 0);
});

test("measurement signals and system-work blockers do not inflate human attention", () => {
  const summary = summarizeSocialAutopilot([
    {
      brandId: "a",
      brandName: "A",
      platform: "google_search_console",
      connected: true,
      pilotReady: false,
      pilotBlockReason: null,
      published: 0,
      measuredEligible: 0,
      quarantined: 0,
      liveLearning: false,
      surfaceKind: "signal",
      attentionRequired: false,
    },
    {
      brandId: "a",
      brandName: "A",
      platform: "youtube",
      connected: true,
      pilotReady: false,
      pilotBlockReason: "Publisher governance pending",
      published: 0,
      measuredEligible: 0,
      quarantined: 0,
      liveLearning: false,
      surfaceKind: "destination",
      attentionRequired: false,
    },
  ]);

  assert.equal(summary.connected, 1);
  assert.equal(summary.connectedSignals, 1);
  assert.equal(summary.blockers.length, 0);
  assert.equal(summary.needsAttention, 0);
});
