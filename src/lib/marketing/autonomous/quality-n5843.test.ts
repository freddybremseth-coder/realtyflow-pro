import assert from "node:assert/strict";
import test from "node:test";
import { contentQualityGate, parseBrandContext } from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

const N5843_FACTS = [
  { claim: "Referanse: N5843", source: "RealtyFlow Inventory" },
  { claim: "Tittel: Bungalow med 3 soverom og 2 bad", source: "RealtyFlow Inventory" },
  { claim: "Sted: Los Balcones", source: "RealtyFlow Inventory" },
  { claim: "Region: Costa Blanca South", source: "RealtyFlow Inventory" },
  { claim: "Pris: €330000", source: "RealtyFlow Inventory" },
  { claim: "Soverom: 3", source: "RealtyFlow Inventory" },
  { claim: "Bad: 2", source: "RealtyFlow Inventory" },
  { claim: "Boligtype: Ground Floor Bungalow", source: "RealtyFlow Inventory" },
  { claim: "Energimerking: B", source: "RealtyFlow Inventory" },
  { claim: "Inventory-beskrivelse: Bungalow med 3 soverom og 2 bad i Costa Blanca sør. Boligen er en del av et nytt boligkompleks.", source: "RealtyFlow Inventory" },
];

function asset(body: string, headline = "Drømmer du om et hjem i solen?"): GeneratedAsset {
  return {
    contentId: "n5843",
    creativeVariantId: "n5843_v1",
    campaignId: "camp_n5843",
    channel: "facebook",
    genome: {
      brandId: "zeneco",
      channel: "facebook",
      format: "post",
      hookType: "price_first",
      ctaType: "book_viewing",
      goal: "lead_generation",
      propertyId: "41f65d19-d67b-471d-a336-72d0661d009b",
    } as GeneratedAsset["genome"],
    headline,
    body,
    cta: "Se boligen",
    factSources: N5843_FACTS,
    generator: { model: "sonnet", costEur: 0 },
  } as GeneratedAsset;
}

test("N5843 regression: generic dream-home and unsupported lifestyle filler are rejected", () => {
  const bad = asset(
    "Oppdag denne nydelige bungalowen med 3 soverom og 2 bad i Los Balcones, Costa Blanca South. " +
      "Denne boligen er en del av et nytt boligkompleks og har energimerking B. " +
      "Med et romslig design og moderne fasiliteter, er dette et ideelt valg for både ferie og permanent opphold. " +
      "La oss hjelpe deg med å gjøre drømmen om et hjem i solen til virkelighet!",
  );
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(bad, { brand });

  assert.equal(result.checks.claimsVerified, false);
  for (const expected of [
    "dream-home-in-the-sun wording",
    "beautiful property",
    "spacious design",
    "modern facilities",
    "vacation-and-permanent-stay suitability",
  ]) {
    assert.ok(result.unsupportedOutcomeClaims.includes(expected), `${expected}: ${result.unsupportedOutcomeClaims.join(", ")}`);
  }
  assert.ok(result.score < 100, `score var ${result.score}`);
});

test("N5843 regression: concise source-bound property copy remains allowed", () => {
  const clean = asset(
    "Bungalow med 3 soverom og 2 bad i Los Balcones, Costa Blanca South. Boligen er en del av et nytt boligkompleks og har energimerking B.",
    "Bungalow med 3 soverom i Los Balcones",
  );
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(clean, { brand });

  assert.equal(result.checks.claimsVerified, true);
  assert.deepEqual(result.unsupportedOutcomeClaims, []);
});

test("N5878 service filler is now rejected when it is not fact-sourced", () => {
  const bad = asset(
    "Vi i Zen Eco Homes er her for å veilede deg gjennom hele prosessen, fra visning til kjøp.",
    "Bungalow med 3 soverom i Los Balcones",
  );
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(bad, { brand });

  assert.equal(result.checks.claimsVerified, false);
  assert.ok(result.unsupportedOutcomeClaims.includes("full-process guidance promise"));
});
