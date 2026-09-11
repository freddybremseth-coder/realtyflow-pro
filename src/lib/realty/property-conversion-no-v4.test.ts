import assert from "node:assert/strict";
import test from "node:test";
import { propertyConversionOutputIsSafe, propertyConversionSource } from "./property-conversion-no";

function baseSource(description: string) {
  return propertyConversionSource({
    property_type: "Villa",
    town: "Aspe",
    bedrooms: 3,
    bathrooms: 2,
    source_description: description,
  });
}

const common = {
  key_reasons_no: ["Tre soverom er oppgitt.", "To bad er oppgitt.", "Boligtypen er oppgitt som villa."],
  lifestyle_no: "Boligdataene beskriver ikke livsstil utover de oppgitte faktaene.",
  ideal_for_no: ["Kjøpere som ønsker tre separate soverom."],
  cta_reason_no: "Be om prospekt og plantegninger for å bekrefte boligfakta.",
};

test("v4 rejects vague source hype even when source contains it", () => {
  const phrases = [
    "stor tomt",
    "fullt utstyrt",
    "typisk spansk landsby",
    "sosialt område",
    "konsolidert urbanisering",
    "godt tilpasset for komfortabelt opphold",
  ];
  for (const phrase of phrases) {
    const source = baseSource(`Villa med tre soverom og to bad. ${phrase}.`);
    assert.equal(propertyConversionOutputIsSafe({
      ...common,
      selling_intro_no: `Villa i Aspe med tre soverom og to bad. Kildebeskrivelsen omtaler ${phrase}.`,
    }, source), false, phrase);
  }
});

test("v4 accepts neutral factual copy", () => {
  const source = propertyConversionSource({
    property_type: "Villa",
    town: "Aspe",
    bedrooms: 3,
    bathrooms: 2,
    built_area: 140.17,
    source_description: "Villa med tre soverom og to bad. Konstruert areal 140,17 m2.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    ...common,
    selling_intro_no: "Villa i Aspe med tre soverom og to bad. Oppgitt konstruert areal er 140,17 m2.",
  }, source), true);
});

test("v4 rejects invented decimal area", () => {
  const source = propertyConversionSource({
    property_type: "Villa",
    town: "Aspe",
    bedrooms: 3,
    bathrooms: 2,
    source_description: "Villa med tre soverom og to bad. Konstruert areal 140,17 m2.",
  });
  assert.equal(propertyConversionOutputIsSafe({
    ...common,
    selling_intro_no: "Villa i Aspe med tre soverom og to bad. Oppgitt konstruert areal er 155,40 m2.",
  }, source), false);
});
