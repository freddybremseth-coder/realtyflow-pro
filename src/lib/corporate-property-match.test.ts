import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCorporateModel, scoreCorporateProperty } from "@/lib/corporate-property-match";

const assessment = {
  model: "Ansattbolig",
  budget_min_eur: 300000,
  budget_max_eur: 600000,
  preferred_area: "Costa Blanca / åpen for forslag",
  bedrooms_min: 3,
  property_type: "Leilighet eller villa",
  airport_max_minutes: 60,
};

test("Corporate property match rewards real boolean garage and pool fields", () => {
  const result = scoreCorporateProperty({
    title_no: "Leilighet i Finestrat",
    town: "Finestrat",
    price: 520000,
    bedrooms: 3,
    bathrooms: 2,
    built_area: 115,
    property_type: "Leilighet",
    garage: true,
    pool: true,
    plot_size: 0,
  }, assessment);

  assert.ok(result.score >= 70);
  assert.ok(result.reasons.includes("Garasje/parkering er registrert"));
  assert.ok(result.reasons.includes("Basseng er registrert"));
  assert.equal(result.model, "employee_home");
});

test("Corporate property match penalizes properties clearly above max budget", () => {
  const result = scoreCorporateProperty({
    title_no: "Villa i Altea",
    town: "Altea",
    price: 1500000,
    bedrooms: 4,
    bathrooms: 4,
    built_area: 300,
    property_type: "Villa",
    garage: true,
    pool: true,
    plot_size: 900,
  }, assessment);

  assert.ok(result.cautions.includes("Klart over oppgitt maksbudsjett"));
  assert.ok(result.score < 70);
});

test("Corporate villa model recognizes retreat-style capacity", () => {
  const result = scoreCorporateProperty({
    title_no: "Stor villa",
    town: "Altea",
    price: 850000,
    bedrooms: 5,
    bathrooms: 4,
    built_area: 240,
    property_type: "Villa",
    garage: true,
    pool: true,
    plot_size: 700,
  }, {
    ...assessment,
    model: "Bedriftsvilla",
    budget_max_eur: 1000000,
    property_type: "Villa",
  });

  assert.equal(normalizeCorporateModel("Bedriftsvilla"), "corporate_villa");
  assert.equal(result.classification, "Corporate Retreat");
  assert.ok(result.reasons.includes("Villa passer arbeidsmodellen"));
});

test("Airport constraint is visible but not fabricated as travel-time evidence", () => {
  const result = scoreCorporateProperty({
    title_no: "Leilighet",
    town: "Benidorm",
    price: 450000,
    bedrooms: 3,
    bathrooms: 2,
    built_area: 110,
    property_type: "Leilighet",
  }, assessment);

  assert.ok(result.cautions.includes("Flyplasstid må verifiseres separat før shortlist deles"));
});
