import assert from "node:assert/strict";
import test from "node:test";
import { computePropertyEditorialSourceHash } from "./property-editorial-no";

const base = {
  property_type: "Leilighet",
  bedrooms: 2,
  bathrooms: 2,
  location: "Finestrat",
  built_area: 90,
  floor_label: "2",
  amenities_no: ["Parkering"],
  energy_rating: "B",
  price: 300000,
  source_description: "Kilde",
  orientation_source: "Sør",
};

test("every factual editorial input can invalidate the source hash", () => {
  const hash = computePropertyEditorialSourceHash(base);
  for (const changed of [
    { property_type: "Villa" },
    { bedrooms: 3 },
    { bathrooms: 1 },
    { location: "Benidorm" },
    { built_area: 95 },
    { floor_label: "3" },
    { amenities_no: ["Parkering", "Basseng"] },
    { energy_rating: "A" },
    { price: 310000 },
    { source_description: "Endret kilde" },
    { orientation_source: "Øst" },
  ]) {
    assert.notEqual(computePropertyEditorialSourceHash({ ...base, ...changed }), hash);
  }
});
