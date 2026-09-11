import assert from "node:assert/strict";
import test from "node:test";
import { contentQualityGate, parseBrandContext, unsupportedOutcomeClaims } from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

const N5844_BAD_COPY = [
  "Oppdag denne toppetasjebungalowen i Los Balcones",
  "I vakre Los Balcones kan du nå bli eier av en toppetasjebungalow med 2 soverom og 2 bad.",
  "Boligen ligger i et nytt boligkompleks i Costa Blanca South og er energimerket med B.",
  "Dette er en utmerket mulighet for deg som ønsker et hjem i solen.",
].join(" ");

const N5844_FACTS = [
  { claim: "Referanse: N5844", source: "RealtyFlow Inventory" },
  { claim: "Tittel: Bungalow i toppetasje med 2 soverom og 2 bad", source: "RealtyFlow Inventory" },
  { claim: "Sted: Los Balcones", source: "RealtyFlow Inventory" },
  { claim: "Region: Costa Blanca South", source: "RealtyFlow Inventory" },
  { claim: "Pris: €340000", source: "RealtyFlow Inventory" },
  { claim: "Soverom: 2", source: "RealtyFlow Inventory" },
  { claim: "Bad: 2", source: "RealtyFlow Inventory" },
  { claim: "Boligtype: Top Floor Bungalow", source: "RealtyFlow Inventory" },
  { claim: "Energimerking: B", source: "RealtyFlow Inventory" },
  { claim: "Inventory-beskrivelse: Bungalow i toppetasje med 2 soverom og 2 bad i Costa Blanca sør. Boligen ligger i et nytt boligkompleks i Los Balcones.", source: "RealtyFlow Inventory" },
];

function asset(): GeneratedAsset {
  return {
    contentId: "n5844",
    creativeVariantId: "n5844_v1",
    campaignId: "camp_n5844",
    channel: "facebook",
    genome: {
      brandId: "zeneco",
      channel: "facebook",
      format: "post",
      hookType: "property_first",
      ctaType: "view_property",
      goal: "leads",
      propertyId: "f5f44d1d-3ddb-497e-9ffa-0841b7fcfb99",
    } as GeneratedAsset["genome"],
    headline: undefined,
    body: N5844_BAD_COPY,
    cta: "Se boligen",
    factSources: N5844_FACTS,
    generator: { model: "sonnet", costEur: 0 },
  } as GeneratedAsset;
}

test("N5844 regression: subjective location/opportunity/lifestyle filler is source-bound", () => {
  assert.deepEqual(
    unsupportedOutcomeClaims(N5844_BAD_COPY, N5844_FACTS, { inventoryBound: true }),
    ["location praise", "excellent opportunity", "home-in-the-sun suitability"],
  );
});

test("N5844 regression: unsupported filler cannot score quality 100", () => {
  const brand = parseBrandContext({ brandId: "zeneco", brandName: "Zen Eco Homes" });
  const result = contentQualityGate(asset(), { brand });
  assert.equal(result.checks.claimsVerified, false);
  assert.ok(result.unsupportedOutcomeClaims.includes("location praise"));
  assert.ok(result.unsupportedOutcomeClaims.includes("excellent opportunity"));
  assert.ok(result.unsupportedOutcomeClaims.includes("home-in-the-sun suitability"));
  assert.ok(result.score < 100, `score var ${result.score}`);
});

test("inventory-only N5844 markers do not affect generic brand copy", () => {
  assert.deepEqual(unsupportedOutcomeClaims("Drømmer du om et hjem i solen?", []), []);
});
