import assert from "node:assert/strict";
import test from "node:test";
import { planAdCampaign } from "./campaign-planner";

const baseInput = {
  productName: "Doña Anna Verde Alto olive oil",
  productImageUrl: "https://example.com/product.png",
  labelDescription: "dark glass bottle, white Doña Anna label, green and gold details",
  audienceSegments: ["Scandinavian premium food buyers"],
  targetMarkets: ["Norway", "Spain"],
  brandVoice: "warm, credible and premium",
  offer: "15% på første bestilling",
  campaignStyle: "mixed" as const,
  overlayMode: "suggestions" as const,
  preserveProductIdentity: true,
  totalCreatives: 50,
  aspectRatios: ["1:1", "4:5", "9:16"] as const,
  conceptCount: 10,
  variantsPerConcept: 5,
};

test("plans exactly 50 creatives across ten concept families", () => {
  const plan = planAdCampaign({ ...baseInput, providerMode: "auto" });
  assert.equal(plan.creatives.length, 50);
  assert.equal(plan.concepts.length, 10);

  const counts = plan.creatives.reduce<Record<string, number>>((result, creative) => {
    result[creative.conceptGroup] = (result[creative.conceptGroup] || 0) + 1;
    return result;
  }, {});
  assert.equal(Object.keys(counts).length, 10);
  assert.deepEqual([...new Set(Object.values(counts))], [5]);
});

test("auto mode allocates creatives to Gemini, OpenArt and Flux", () => {
  const plan = planAdCampaign({ ...baseInput, providerMode: "auto" });
  const providers = new Set(plan.creatives.map((creative) => creative.provider));
  assert.deepEqual([...providers].sort(), ["flux", "gemini", "openart"]);
  assert.equal(Object.values(plan.providerStrategy.counts).reduce((sum, count) => sum + count, 0), 50);
});

test("explicit provider mode keeps every creative on the selected provider", () => {
  for (const providerMode of ["gemini", "openart", "flux"] as const) {
    const plan = planAdCampaign({ ...baseInput, providerMode });
    assert.ok(plan.creatives.every((creative) => creative.provider === providerMode));
  }
});

test("provider prompts preserve identity and keep overlay copy outside the image", () => {
  const plan = planAdCampaign({ ...baseInput, providerMode: "auto" });
  for (const creative of plan.creatives) {
    assert.match(creative.prompt, /Preserve the exact real product identity/i);
    assert.match(creative.prompt, /Do not render headline, offer, badge or CTA text inside the image/i);
    assert.ok(creative.overlayHeadline);
    assert.ok(creative.overlayCta);
  }
});

test("none overlay mode creates clean images without overlay fields", () => {
  const plan = planAdCampaign({
    ...baseInput,
    providerMode: "gemini",
    overlayMode: "none",
    totalCreatives: 10,
    conceptCount: 10,
    variantsPerConcept: 1,
  });
  assert.equal(plan.creatives.length, 10);
  for (const creative of plan.creatives) {
    assert.equal(creative.overlayHeadline, null);
    assert.equal(creative.overlaySubheadline, null);
    assert.equal(creative.overlayCta, null);
    assert.equal(creative.overlayBadge, null);
  }
});

test("Meta landscape is retained in planning and can be normalized by providers", () => {
  const plan = planAdCampaign({
    ...baseInput,
    providerMode: "flux",
    totalCreatives: 10,
    conceptCount: 10,
    variantsPerConcept: 1,
    aspectRatios: ["1.91:1"],
  });
  assert.ok(plan.creatives.every((creative) => creative.aspectRatio === "1.91:1"));
});
