import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreativeDna,
  buildPaidCreativeUtm,
  creativeFormatForAspectRatio,
  creativeTrackingCode,
  hookFamilyForConcept,
  normalizeGrowthGoal,
} from "./creative-dna";

test("creative tracking code is deterministic per campaign/concept/variant", () => {
  const a = creativeTrackingCode({ campaignId: "12345678-1234-1234-1234-123456789abc", conceptGroup: "lifestyle_context", variantIndex: 3 });
  const b = creativeTrackingCode({ campaignId: "12345678-1234-1234-1234-123456789abc", conceptGroup: "lifestyle_context", variantIndex: 3 });
  const c = creativeTrackingCode({ campaignId: "12345678-1234-1234-1234-123456789abc", conceptGroup: "lifestyle_context", variantIndex: 4 });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^rfad_/);
});

test("legacy or unknown growth goals remain unspecified", () => {
  assert.equal(normalizeGrowthGoal(undefined), "unspecified");
  assert.equal(normalizeGrowthGoal("magic_sales"), "unspecified");
  assert.equal(normalizeGrowthGoal("direct_sales"), "direct_sales");
});

test("Creative DNA captures explicit strategy without inventing audience assignment", () => {
  const dna = buildCreativeDna({
    campaign: {
      growth_goal: "lead_generation",
      audience_segments: ["Norwegian buyers", "English-speaking expats"],
      target_markets: ["NO", "ES"],
      funnel_stage: "cold",
      offer: "Book a viewing",
      default_language: "nb-NO",
      campaign_style: "lifestyle",
      preserve_product_identity: true,
    },
    creative: {
      conceptGroup: "lifestyle_context",
      angle: "Lifestyle",
      mood: "bright/airy",
      aspectRatio: "9:16",
      overlayHeadline: "Se livet her",
      overlaySubheadline: "Costa Blanca",
      overlayCta: "Les mer",
      provider: "openart",
      model: "openart-dynamic-image",
    },
  });
  assert.equal(dna.growthGoal, "lead_generation");
  assert.equal(dna.hookFamily, "aspiration");
  assert.equal(dna.creativeFormat, "image_vertical");
  assert.deepEqual(dna.audienceSegments, ["Norwegian buyers", "English-speaking expats"]);
  assert.equal(dna.language, "nb-NO");
});

test("concept and format classifiers stay stable", () => {
  assert.equal(hookFamilyForConcept("promo_offer"), "offer");
  assert.equal(hookFamilyForConcept("unknown"), "unclassified");
  assert.equal(creativeFormatForAspectRatio("4:5"), "image_portrait");
});

test("paid UTM uses stable tracking code as utm_content", () => {
  const utm = buildPaidCreativeUtm({ channel: "instagram", campaignId: "campaign-1", trackingCode: "rfad_abc_offer_1" });
  assert.deepEqual(utm, {
    utm_source: "instagram",
    utm_medium: "paid_social",
    utm_campaign: "campaign-1",
    utm_content: "rfad_abc_offer_1",
  });
});
