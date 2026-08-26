import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFreddyBrandChannelState, FREDDY_BRAND_IDS, freddyBrandDefinitions } from "@/lib/brand-channel-brain";

test("Freddy brand brain exposes the three canonical professional brands", () => {
  assert.deepEqual(freddyBrandDefinitions().map((brand) => brand.id), [...FREDDY_BRAND_IDS]);
});

test("channel state distinguishes connected, blocked and planned-only channels", () => {
  const states = buildFreddyBrandChannelState([
    { brandId: "freddyb", brandName: "Freddy Bremseth", platform: "facebook", connected: true, pilotReady: false, pilotBlockReason: "Awaiting pilot approval", published: 0, measuredEligible: 0, quarantined: 0, liveLearning: false },
    { brandId: "freddypublishing", brandName: "Freddy Publishing", platform: "instagram", connected: true, pilotReady: true, pilotBlockReason: null, published: 2, measuredEligible: 1, quarantined: 0, liveLearning: false },
  ]);
  const personal = states.find((state) => state.brand.id === "freddyb");
  assert.ok(personal);
  assert.deepEqual(personal.connectedChannels, ["facebook"]);
  assert.equal(personal.blockedChannels[0]?.platform, "facebook");
  assert.equal(personal.plannedOnlyChannels.includes("instagram"), true);
  const publishing = states.find((state) => state.brand.id === "freddypublishing");
  assert.deepEqual(publishing?.pilotReadyChannels, ["instagram"]);
});
