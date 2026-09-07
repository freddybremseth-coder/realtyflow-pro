import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPropertyEditorialFallback,
  computePropertyEditorialSourceHash,
  existingEditorialHasSameSource,
  propertyEditorialSource,
} from "./property-editorial-no";

const property = {
  property_type: "Leilighet",
  bedrooms: 2,
  bathrooms: 2,
  location: "Finestrat",
  built_area: 92,
  floor_label: "2",
  amenities_no: ["Privat parkering", "Aircondition", "Sørvendt"],
  energy_rating: "B",
  price: 349000,
  source_description: "Moderne leilighet med to soverom og sørvendt terrasse.",
};

test("source hash is stable for insignificant whitespace but changes with factual input", () => {
  const base = computePropertyEditorialSourceHash(property);
  assert.equal(
    computePropertyEditorialSourceHash({ ...property, source_description: "  Moderne   leilighet med to soverom og sørvendt terrasse.  " }),
    base,
  );
  assert.notEqual(computePropertyEditorialSourceHash({ ...property, price: 359000 }), base);
  assert.notEqual(
    computePropertyEditorialSourceHash({ ...property, amenities_no: [...property.amenities_no, "Fellesbasseng"] }),
    base,
  );
});

test("source payload preserves factual feed fields", () => {
  const source = propertyEditorialSource(property);
  assert.equal(source.type, "Leilighet");
  assert.equal(source.beds, 2);
  assert.equal(source.baths, 2);
  assert.equal(source.area, "Finestrat");
  assert.equal(source.m2, 92);
  assert.equal(source.floor, "2");
  assert.equal(source.epc, "B");
  assert.equal(source.price, 349000);
  assert.match(source.rawDescription, /sørvendt terrasse/);
});

test("fallback is neutral and never invents an orientation", () => {
  const fallback = buildPropertyEditorialFallback(
    { ...property, orientation_source: undefined },
    new Date("2026-09-07T10:00:00.000Z"),
  );
  assert.equal(fallback.orientation_no, "Ikke angitt");
  assert.equal(fallback.generated_at, "2026-09-07T10:00:00.000Z");
  assert.equal(fallback.model, "template-v1");
  assert.doesNotMatch(
    `${fallback.headline_no} ${fallback.intro_no} ${fallback.bullets_no.join(" ")}`,
    /drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt/i,
  );
  assert.match(fallback.intro_no, /Energiklasse B/);
  assert.doesNotMatch(fallback.intro_no, /høy energieffektivitet|god energieffektivitet/i);
});

test("existing editorial is reused only while every source fact is unchanged", () => {
  const editorial = buildPropertyEditorialFallback(property);
  assert.equal(existingEditorialHasSameSource(property, editorial), true);
  assert.equal(existingEditorialHasSameSource({ ...property, bedrooms: 3 }, editorial), false);
});
