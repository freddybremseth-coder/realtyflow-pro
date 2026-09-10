import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPropertyConversionFallback,
  computePropertyConversionSourceHash,
  propertyConversionSource,
} from "./property-conversion-no";

test("conversion source prefers canonical town over broad feed region", () => {
  const source = propertyConversionSource({
    property_type: "VILLA",
    town: "La Romana",
    location: "Costa Blanca South - Inland",
    bedrooms: 3,
    bathrooms: 2,
    built_area: 134,
  });
  assert.equal(source.town, "La Romana");
  assert.equal(source.region, "Costa Blanca South - Inland");
});

test("fallback creates persuasive factual structure without broker hype", () => {
  const property = {
    property_type: "VILLA",
    town: "Rojales",
    location: "Costa Blanca South",
    bedrooms: 3,
    bathrooms: 2,
    built_area: 128,
    plot_size: 310,
    pool: true,
    source_description: "Villa i Rojales med 3 soverom, 2 bad, privat basseng, terrasse og åpen kjøkkenløsning.",
  };
  const conversion = buildPropertyConversionFallback(property, new Date("2026-09-10T20:00:00Z"));
  assert.match(conversion.selling_intro_no, /Rojales/);
  assert.ok(conversion.key_reasons_no.length >= 3);
  assert.match(conversion.lifestyle_no, /ute/i);
  assert.doesNotMatch(
    JSON.stringify(conversion),
    /drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt|førsteklasses/i,
  );
});

test("source hash changes when a conversion-relevant fact changes", () => {
  const base = { town: "Altea", property_type: "Villa", bedrooms: 3, bathrooms: 2, price: 500000 };
  assert.notEqual(
    computePropertyConversionSourceHash(base),
    computePropertyConversionSourceHash({ ...base, price: 525000 }),
  );
});
