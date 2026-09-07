import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluatePropertyEditorialApproval,
  normalizePropertyForEditorial,
  normalizePropertyLocationNo,
  normalizePropertyTypeNo,
} from "./property-editorial-quality";

test("normalizes common feed property types to natural Norwegian", () => {
  assert.equal(normalizePropertyTypeNo("Semidetached"), "Tomannsbolig");
  assert.equal(normalizePropertyTypeNo("Top Floor Bungalow"), "Bungalow i toppetasje");
  assert.equal(normalizePropertyTypeNo("Ground Floor Bungalow"), "Bungalow");
  assert.equal(normalizePropertyTypeNo("Penthouse"), "Toppleilighet");
  assert.equal(normalizePropertyTypeNo("Quad"), "Rekkehus");
});

test("normalizes feed region labels and unknown locations", () => {
  assert.equal(normalizePropertyLocationNo("Costa Blanca South - Inland"), "Costa Blanca sør – innland");
  assert.equal(normalizePropertyLocationNo("Costa Blanca North"), "Costa Blanca nord");
  assert.equal(normalizePropertyLocationNo("Costa Calida"), "Costa Cálida");
  assert.equal(normalizePropertyLocationNo("Ukjent"), "Ikke angitt");
});

test("normalized property is used as editorial source", () => {
  const normalized = normalizePropertyForEditorial({
    ref: "N1",
    property_type: "Semidetached",
    location: "Costa Blanca South",
  });
  assert.equal(normalized.property_type, "Tomannsbolig");
  assert.equal(normalized.location, "Costa Blanca sør");
});

test("approves clean copy supported by source facts", () => {
  const property = {
    ref: "N1",
    property_type: "Villa",
    location: "Polop",
    bedrooms: 3,
    bathrooms: 2,
    price: 390000,
    source_description: "Villa med 3 soverom og 2 bad i Polop. Privat basseng og parkering på tomten.",
  };
  const approval = evaluatePropertyEditorialApproval(property, {
    headline_no: "Villa med 3 soverom i Polop",
    intro_no: "Villa med 3 soverom og 2 bad i Polop.",
    bullets_no: ["Privat basseng", "Parkering på tomten"],
    orientation_no: "Ikke angitt",
  });
  assert.equal(approval.approved, true);
  assert.deepEqual(approval.reasons, []);
});

test("rejects weak source, promotional copy and unsupported numbers", () => {
  const weak = evaluatePropertyEditorialApproval(
    { ref: "", property_type: "Villa", location: "Ukjent", source_description: "" },
    {
      headline_no: "Fantastisk villa i Ukjent",
      intro_no: "Villa med 4 soverom.",
      bullets_no: [],
      orientation_no: "Ikke angitt",
    },
  );
  assert.equal(weak.approved, false);
  assert.ok(weak.reasons.includes("missing_ref"));
  assert.ok(weak.reasons.includes("weak_source_description"));
  assert.ok(weak.reasons.includes("unknown_location"));
  assert.ok(weak.reasons.includes("public_unknown_placeholder"));
  assert.ok(weak.reasons.includes("promotional_language"));
  assert.ok(weak.reasons.some((reason) => reason.startsWith("unsupported_numbers:")));
});
