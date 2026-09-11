import assert from "node:assert/strict";
import test from "node:test";
import { contentQualityGate, parseBrandContext } from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

const N5878_BAD_COPY = [
  "Leilighet med 3 soverom i Costa Cálida",
  "Denne leiligheten med 3 soverom og 2 bad ligger i Costa Cálida.",
  "Boligen har energimerking B, noe som er en indikasjon på energieffektivitet.",
  "Med en pris på €341,000 er dette en spennende mulighet for deg som vurderer eiendom i Spania.",
  "Vi i Zen Eco Homes er her for å veilede deg gjennom hele prosessen, fra visning til kjøp.",
].join(" ");

const N5878_FACTS = [
  { claim: "Referanse: N5878", source: "RealtyFlow Inventory" },
  { claim: "Tittel: Leilighet med 3 soverom i Costa Cálida", source: "RealtyFlow Inventory" },
  { claim: "Sted: Costa Cálida", source: "RealtyFlow Inventory" },
  { claim: "Region: Costa Calida", source: "RealtyFlow Inventory" },
  { claim: "Pris: €341000", source: "RealtyFlow Inventory" },
  { claim: "Soverom: 3", source: "RealtyFlow Inventory" },
  { claim: "Bad: 2", source: "RealtyFlow Inventory" },
  { claim: "Boligtype: Ground floor apartment", source: "RealtyFlow Inventory" },
  { claim: "Energimerking: B", source: "RealtyFlow Inventory" },
  { claim: "Inventory-beskrivelse: Leilighet med 3 soverom og 2 bad i Costa Cálida. Energiklasse B.", source: "RealtyFlow Inventory" },
];

function asset(): GeneratedAsset {
  return {
    contentId: "n5878",
    creativeVariantId: "n5878_v1",
    campaignId: "camp_n5878",
    channel: "facebook",
    genome: {
      brandId: "zeneco",
      channel: "facebook",
      format: "post",
      hookType: "property_first",
      ctaType: "view_property",
      goal: "leads",
      propertyId: "48e9623f-8f17-4ceb-b0f0-35ab23259e2f",
    } as GeneratedAsset["genome"],
    headline: undefined,
    body: N5878_BAD_COPY,
    cta: "Se boligen",
    factSources: N5878_FACTS,
    generator: { model: "sonnet", costEur: 0 },
  } as GeneratedAsset;
}

test("N5878 regression: energy label inference and subjective opportunity are rejected", () => {
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(asset(), { brand });

  assert.equal(result.checks.claimsVerified, false);
  assert.ok(result.unsupportedOutcomeClaims.includes("energy label implies efficiency"));
  assert.ok(result.unsupportedOutcomeClaims.includes("subjective opportunity"));
  assert.ok(result.score < 100, `score var ${result.score}`);
});

test("N5878 regression: sourced energy label alone remains allowed", () => {
  const clean = asset();
  clean.body = "Leilighet med 3 soverom og 2 bad i Costa Cálida. Energimerking B. Pris €341,000.";
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(clean, { brand });

  assert.equal(result.unsupportedOutcomeClaims.includes("energy label implies efficiency"), false);
  assert.equal(result.unsupportedOutcomeClaims.includes("subjective opportunity"), false);
});