import assert from "node:assert/strict";
import test from "node:test";
import { contentQualityGate, parseBrandContext } from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

const facts = [
  { claim: "Referanse: N5843", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Bungalow med 3 soverom og 2 bad i Los Balcones", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Energimerking: B", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
];

function asset(body: string): GeneratedAsset {
  return {
    contentId: "n5843-fallback",
    creativeVariantId: "n5843-fallback-v1",
    campaignId: "campaign-n5843",
    channel: "facebook",
    genome: {
      brandId: "zeneco",
      channel: "facebook",
      format: "post",
      hookType: "lifestyle",
      ctaType: "contact",
      goal: "leads",
      // Intentionally no propertyId: production can still be Inventory-bound via factSources.
    } as GeneratedAsset["genome"],
    headline: "Drømmer du om et hjem i solen?",
    body,
    cta: "Se boligen",
    factSources: facts,
    generator: { model: "test", costEur: 0 },
  } as GeneratedAsset;
}

test("RealtyFlow Inventory factSources activate strict property quality even without genome.propertyId", () => {
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(asset(
    "Oppdag denne nydelige bungalowen. Med romslig design og moderne fasiliteter er dette et ideelt valg for både ferie og permanent opphold.",
  ), { brand, generated: true });

  assert.equal(result.checks.claimsVerified, false);
  assert.ok(result.score < 100);
  for (const expected of [
    "dream-home-in-the-sun wording",
    "beautiful property",
    "spacious design",
    "modern facilities",
    "vacation-and-permanent-stay suitability",
  ]) {
    assert.ok(result.unsupportedOutcomeClaims.includes(expected), `${expected}: ${result.unsupportedOutcomeClaims.join(", ")}`);
  }
});

test("Inventory factSources without propertyId do not penalize concise sourced copy", () => {
  const clean = asset("Bungalow med 3 soverom og 2 bad i Los Balcones. Energimerking B.");
  clean.headline = "Bungalow med 3 soverom i Los Balcones";
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(clean, { brand, generated: true });

  assert.equal(result.checks.claimsVerified, true);
  assert.deepEqual(result.unsupportedOutcomeClaims, []);
});
