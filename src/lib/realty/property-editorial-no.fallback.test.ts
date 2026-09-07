import assert from "node:assert/strict";
import test from "node:test";
import { buildPropertyEditorialFallback } from "./property-editorial-no";

test("fallback keeps unknown orientation explicit and factual", () => {
  const editorial = buildPropertyEditorialFallback({
    property_type: "Villa",
    bedrooms: 3,
    bathrooms: 2,
    location: "Altea",
    built_area: 140,
    energy_rating: "B",
    price: 525000,
    source_description: "Villa med tre soverom og to bad.",
  });

  assert.equal(editorial.orientation_no, "Ikke angitt");
  assert.match(editorial.headline_no, /Villa med 3 soverom i Altea/);
  assert.doesNotMatch(`${editorial.headline_no} ${editorial.intro_no}`, /perfekt|fantastisk|unik|drømmebolig/i);
});
