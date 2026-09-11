import assert from "node:assert/strict";
import test from "node:test";
import { contentQualityGate, parseBrandContext, unsupportedOutcomeClaims } from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

const N5879_BAD_COPY = [
  "Leilighet med 3 soverom i Costa Cálida",
  "Oppdag denne romslige leiligheten med 3 soverom og 2 bad, perfekt plassert i Costa Cálida.",
  "Med energimerking klasse B, tilbyr denne boligen en moderne løsning for ditt nye hjem eller feriebolig.",
  "Ta steget mot et liv i solen med trygg norsk rådgivning gjennom hele kjøpsprosessen.",
].join(" ");

const N5879_FACTS = [
  { claim: "Referanse: N5879", source: "RealtyFlow Inventory" },
  { claim: "Tittel: Leilighet med 3 soverom i Costa Cálida", source: "RealtyFlow Inventory" },
  { claim: "Sted: Costa Cálida", source: "RealtyFlow Inventory" },
  { claim: "Region: Costa Calida", source: "RealtyFlow Inventory" },
  { claim: "Pris: €431000", source: "RealtyFlow Inventory" },
  { claim: "Soverom: 3", source: "RealtyFlow Inventory" },
  { claim: "Bad: 2", source: "RealtyFlow Inventory" },
  { claim: "Boligtype: Leilighet", source: "RealtyFlow Inventory" },
  { claim: "Energimerking: B", source: "RealtyFlow Inventory" },
  { claim: "Inventory-beskrivelse: Leilighet med 3 soverom og 2 bad i Costa Cálida. Energiklasse B.", source: "RealtyFlow Inventory" },
];

function asset(): GeneratedAsset {
  return {
    contentId: "n5879",
    creativeVariantId: "n5879_v1",
    campaignId: "camp_n5879",
    channel: "facebook",
    genome: {
      brandId: "zeneco",
      channel: "facebook",
      format: "post",
      hookType: "property_first",
      ctaType: "view_property",
      goal: "leads",
      propertyId: "ab5b5017-a0b7-40c4-a094-73bc01b48e1f",
    } as GeneratedAsset["genome"],
    headline: undefined,
    body: N5879_BAD_COPY,
    cta: "Se boligen",
    factSources: N5879_FACTS,
    generator: { model: "sonnet", costEur: 0 },
  } as GeneratedAsset;
}

test("N5879 regression: property filler is source-bound", () => {
  assert.deepEqual(
    unsupportedOutcomeClaims(N5879_BAD_COPY, N5879_FACTS, { inventoryBound: true }),
    [
      "spacious property",
      "perfect placement",
      "modern solution",
      "new-or-holiday-home suitability",
      "life-in-the-sun lifestyle",
      "safe advisory promise",
    ],
  );
});

test("N5879 regression: unsupported filler cannot score quality 100", () => {
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(asset(), { brand });
  assert.equal(result.checks.claimsVerified, false);
  assert.ok(result.score < 100, `score var ${result.score}`);
});

test("N5879 inventory markers stay scoped to inventory-bound copy", () => {
  assert.deepEqual(unsupportedOutcomeClaims("Trygg norsk rådgivning for boligkjøpere.", []), []);
});
