import assert from "node:assert/strict";
import test from "node:test";
import { buildPropertyConversionFallback } from "./property-conversion-no";

test("v6 fallback keeps Aspe source facts without source hype", () => {
  const copy = buildPropertyConversionFallback({
    property_type: "Villa",
    town: "Aspe",
    bedrooms: 3,
    bathrooms: 2,
    source_description: "MODERNE VILLA MELLOM HAV OG FJELL Fantastisk nybyggvilla bygget på en 400m2 tomt i Aspe. Hytta har et konstruert areal på 140,17m2, i én etasje, med en 19,20m2 veranda, en 41,50m2 stue-spisestue-kjøkken, 3 soverom, 2 bad, et galleri og et 27,55m2 solarium.",
  });
  const text = JSON.stringify(copy);
  assert.match(text, /400 m²/);
  assert.match(text, /140,17 m²/);
  assert.match(text, /én etasje/);
  assert.match(text, /19,20 m²/);
  assert.doesNotMatch(text, /fantastisk|moderne villa|stor tomt|luksus/i);
});

test("v6 fallback preserves documented golf facts without praise", () => {
  const copy = buildPropertyConversionFallback({
    property_type: "Leilighet",
    town: "Alhama de Murcia",
    bedrooms: 2,
    bathrooms: 2,
    source_description: "NYE LEILIGHETER I CONDADO DE ALHAMA GOLFBANE Nye leiligheter med to soverom og to bad med golfutsikt i frontlinjen av ALHAMA SIGNATURE GOLF, en fabelaktig 18-hulls golfbane designet av Jack Nicklaus.",
  });
  const text = JSON.stringify(copy);
  assert.match(text, /Golfutsikt/);
  assert.match(text, /Alhama Signature Golf/);
  assert.match(text, /18-hulls golfbane designet av Jack Nicklaus/);
  assert.doesNotMatch(text, /fabelaktig|fantastisk/i);
});
