import assert from "node:assert/strict";
import test from "node:test";
import { contentQualityGate, parseBrandContext } from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

const CAPTION = [
  "Drømmer du om et hjem i solen?",
  "Oppdag denne nydelige bungalowen med 3 soverom og 2 bad i Los Balcones, Costa Blanca South.",
  "Denne boligen er en del av et nytt boligkompleks og har energimerking B.",
  "Med et romslig design og moderne fasiliteter, er dette et ideelt valg for både ferie og permanent opphold.",
  "La oss hjelpe deg med å gjøre drømmen om et hjem i solen til virkelighet!",
].join(" ");

const FACTS = [
  { claim: "Referanse: N5843", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Tittel: Bungalow med 3 soverom og 2 bad", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Sted: Los Balcones", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Region: Costa Blanca South", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Pris: €330000", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Soverom: 3", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Bad: 2", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Boligtype: Ground Floor Bungalow", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Energimerking: B", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
  { claim: "Inventory-beskrivelse: Bungalow med 3 soverom og 2 bad i Costa Blanca sør. Boligen er en del av et nytt boligkompleks.", source: "RealtyFlow Inventory property:41f65d19-d67b-471d-a336-72d0661d009b ref:N5843" },
];

function asset(): GeneratedAsset {
  return {
    contentId: "n5843-facebook-canary",
    creativeVariantId: "n5843-facebook-canary-v1",
    campaignId: "n5843-facebook-canary-campaign",
    channel: "facebook",
    genome: {
      brandId: "zeneco",
      channel: "facebook",
      format: "post",
      hookType: "lifestyle",
      ctaType: "contact",
      goal: "leads",
    } as GeneratedAsset["genome"],
    headline: "Drømmer du om et hjem i solen?",
    body: CAPTION,
    cta: "Se boligen",
    factSources: FACTS,
    generator: { model: "test", costEur: 0 },
  } as GeneratedAsset;
}

test("N5843 regression: Inventory factSources activate strict quality gate even without genome.propertyId", () => {
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(asset(), { brand, generated: true });

  assert.equal(result.checks.claimsVerified, false);
  assert.ok(result.score < 100, `score var ${result.score}`);
  assert.ok(result.unsupportedOutcomeClaims.includes("home-in-the-sun suitability"));
  assert.ok(result.unsupportedOutcomeClaims.includes("subjective property praise"));
  assert.ok(result.unsupportedOutcomeClaims.includes("spacious design"));
  assert.ok(result.unsupportedOutcomeClaims.includes("modern amenities"));
  assert.ok(result.unsupportedOutcomeClaims.includes("holiday and permanent suitability"));
  assert.ok(result.unsupportedOutcomeClaims.includes("dream-home fulfillment"));
});

test("Inventory facts alone do not create violations for sourced factual copy", () => {
  const clean = asset();
  clean.headline = "Bungalow med 3 soverom og 2 bad";
  clean.body = "Bungalow med 3 soverom og 2 bad i Los Balcones. Boligen er en del av et nytt boligkompleks. Energimerking B.";
  clean.cta = "Se boligen";

  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(clean, { brand, generated: true });
  assert.equal(result.checks.claimsVerified, true);
  assert.deepEqual(result.unsupportedOutcomeClaims, []);
});