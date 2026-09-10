import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPropertyConversionFallback,
  computePropertyConversionSourceHash,
  propertyConversionOutputIsSafe,
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

test("fallback creates factual structure without broker hype", () => {
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
    /drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt|førsteklasses|investor|ideell|attraktiv/i,
  );
});

test("fact gate rejects unsupported investor and ideal-language inference", () => {
  const source = propertyConversionSource({
    property_type: "Villa",
    town: "Aspe",
    bedrooms: 3,
    bathrooms: 2,
    built_area: 140,
    source_description: "Villa med tre soverom, to bad og terrasse.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    selling_intro_no: "Denne villaen i Aspe har tre soverom og to bad, med en terrasse som er oppgitt i boligdataene og bør vurderes nærmere på visning.",
    key_reasons_no: ["Tre soverom gir fleksibilitet.", "To bad er praktisk når flere bruker boligen.", "Terrasse er oppgitt i boligdataene."],
    lifestyle_no: "Terrassen gir mulighet for uteopphold.",
    ideal_for_no: ["Kan være ideell for investorer som ønsker utleiepotensial."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte leveransen.",
  }, source), false);
});

test("fact gate rejects unsupported feature claims", () => {
  const source = propertyConversionSource({
    property_type: "Apartment",
    town: "Altea",
    bedrooms: 2,
    bathrooms: 2,
    built_area: 90,
    source_description: "Apartment with two bedrooms and two bathrooms.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    selling_intro_no: "Leilighet i Altea med to soverom og to bad. Boligen har havutsikt og gir et tydelig utefokus som gjør den verdt å undersøke nærmere.",
    key_reasons_no: ["To soverom gir fleksibilitet.", "To bad er praktisk.", "Havutsikt er oppgitt."],
    lifestyle_no: "Havutsikten kan prege uteoppholdet.",
    ideal_for_no: ["Kjøpere som ønsker to soverom."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte leveransen.",
  }, source), false);
});

test("fact gate accepts directly grounded feature claims", () => {
  const source = propertyConversionSource({
    property_type: "Apartment",
    town: "Calpe",
    bedrooms: 2,
    bathrooms: 2,
    built_area: 90,
    source_description: "Apartment with two bedrooms, two bathrooms, sea views and terrace.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    selling_intro_no: "Leilighet i Calpe med to soverom og to bad. Kildebeskrivelsen oppgir havutsikt og terrasse, som er konkrete forhold å undersøke nærmere.",
    key_reasons_no: ["To soverom gir fleksibilitet.", "To bad er praktisk når flere bruker boligen.", "Havutsikt og terrasse er oppgitt i kilden."],
    lifestyle_no: "Terrassen gir dokumentert mulighet for uteopphold.",
    ideal_for_no: ["Kjøpere som ønsker to separate soverom."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte leveransen.",
  }, source), true);
});

test("source hash changes when a conversion-relevant fact changes", () => {
  const base = { town: "Altea", property_type: "Villa", bedrooms: 3, bathrooms: 2, price: 500000 };
  assert.notEqual(
    computePropertyConversionSourceHash(base),
    computePropertyConversionSourceHash({ ...base, price: 525000 }),
  );
});
