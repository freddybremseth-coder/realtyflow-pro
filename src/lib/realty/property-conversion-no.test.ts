import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPropertyConversionFallback,
  computePropertyConversionSourceHash,
  propertyConversionFactSources,
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
  assert.match(conversion.lifestyle_no, /oppgitt i boligdataene/i);
  assert.doesNotMatch(
    JSON.stringify(conversion),
    /drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt|førsteklasses|investor|ideell|attraktiv|luksus|romslig|sjarmerende/i,
  );
});

test("fact sources expose structured facts, not subjective feed adjectives", () => {
  const source = propertyConversionSource({
    property_type: "Villa",
    town: "Aspe",
    bedrooms: 3,
    bathrooms: 2,
    energy_rating: "B",
    source_description: "Luksuriøs og romslig villa i et fantastisk område med tre soverom og to bad.",
  });
  const claims = propertyConversionFactSources(source).map((item) => item.claim).join(" | ");
  assert.match(claims, /Villa/);
  assert.match(claims, /Aspe/);
  assert.match(claims, /Soverom: 3/);
  assert.match(claims, /Bad: 2/);
  assert.doesNotMatch(claims, /luks|romslig|fantastisk/i);
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
    key_reasons_no: ["Tre soverom er oppgitt.", "To bad er oppgitt.", "Terrasse er oppgitt i boligdataene."],
    lifestyle_no: "Terrassen er oppgitt i boligdataene.",
    ideal_for_no: ["Kan være ideell for investorer som ønsker utleiepotensial."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte leveransen.",
  }, source), false);
});

test("shared inventory guard rejects luxury copied from source description", () => {
  const source = propertyConversionSource({
    property_type: "Villa",
    town: "Costa Blanca Sør",
    bedrooms: 4,
    bathrooms: 4,
    source_description: "Luksus villa på stranden med fire soverom og fire bad.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    selling_intro_no: "Denne luksusvillaen i Costa Blanca Sør har fire soverom og fire bad. Strand er omtalt i kildebeskrivelsen.",
    key_reasons_no: ["Fire soverom er oppgitt.", "Fire bad er oppgitt.", "Strand er omtalt i kilden."],
    lifestyle_no: "Strand er omtalt i kildebeskrivelsen.",
    ideal_for_no: ["Kjøpere som ønsker fire separate soverom."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte boligfakta.",
  }, source), false);
});

test("shared inventory guard rejects spacious property inference", () => {
  const source = propertyConversionSource({
    property_type: "Apartment",
    town: "Calpe",
    bedrooms: 3,
    bathrooms: 2,
    built_area: 105,
    source_description: "Apartment with three bedrooms and two bathrooms.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    selling_intro_no: "Romslig leilighet i Calpe med tre soverom og to bad. Oppgitt boligareal er 105 m².",
    key_reasons_no: ["Tre soverom er oppgitt.", "To bad er oppgitt.", "Oppgitt boligareal er 105 m²."],
    lifestyle_no: "Boligdataene beskriver ikke livsstil utover de oppgitte faktaene.",
    ideal_for_no: ["Kjøpere som ønsker tre separate soverom."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte boligfakta.",
  }, source), false);
});

test("shared inventory guard rejects energy-efficiency inference from label", () => {
  const source = propertyConversionSource({
    property_type: "Apartment",
    town: "Torrevieja",
    bedrooms: 2,
    bathrooms: 2,
    energy_rating: "B",
    source_description: "Apartment with two bedrooms and two bathrooms. Energy rating B.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    selling_intro_no: "Leilighet i Torrevieja med to soverom og to bad. Energiklasse B er oppgitt, og boligen er energieffektiv.",
    key_reasons_no: ["To soverom er oppgitt.", "To bad er oppgitt.", "Energiklasse B er oppgitt."],
    lifestyle_no: "Boligdataene beskriver ikke livsstil utover de oppgitte faktaene.",
    ideal_for_no: ["Kjøpere som ønsker to separate soverom."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte boligfakta.",
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
    selling_intro_no: "Leilighet i Altea med to soverom og to bad. Boligen har havutsikt, som ikke er oppgitt i boligdataene.",
    key_reasons_no: ["To soverom er oppgitt.", "To bad er oppgitt.", "Havutsikt er oppgitt."],
    lifestyle_no: "Havutsikt er omtalt.",
    ideal_for_no: ["Kjøpere som ønsker to soverom."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte leveransen.",
  }, source), false);
});

test("fact gate accepts directly grounded neutral feature claims", () => {
  const source = propertyConversionSource({
    property_type: "Apartment",
    town: "Calpe",
    bedrooms: 2,
    bathrooms: 2,
    built_area: 90,
    source_description: "Apartment with two bedrooms, two bathrooms, sea views and terrace.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    selling_intro_no: "Leilighet i Calpe med to soverom og to bad. Kildebeskrivelsen oppgir havutsikt og terrasse.",
    key_reasons_no: ["To soverom er oppgitt.", "To bad er oppgitt.", "Havutsikt og terrasse er oppgitt i kilden."],
    lifestyle_no: "Terrasse er oppgitt i boligdataene, og utforming bør bekreftes i plantegningene.",
    ideal_for_no: ["Kjøpere som ønsker to separate soverom."],
    cta_reason_no: "Be om prospekt og plantegninger for å bekrefte boligfakta.",
  }, source), true);
});

test("source hash changes when a conversion-relevant fact changes", () => {
  const base = { town: "Altea", property_type: "Villa", bedrooms: 3, bathrooms: 2, price: 500000 };
  assert.notEqual(
    computePropertyConversionSourceHash(base),
    computePropertyConversionSourceHash({ ...base, price: 525000 }),
  );
});
