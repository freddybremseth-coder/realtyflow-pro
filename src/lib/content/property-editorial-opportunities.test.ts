import assert from "node:assert/strict";
import test from "node:test";
import { detectPropertyEditorialOpportunities, type EditorialPropertyFact } from "./property-editorial-opportunities";

const p = (overrides: Partial<EditorialPropertyFact>): EditorialPropertyFact => ({
  id: crypto.randomUUID(),
  ref: "REF",
  town: "Finestrat",
  location: "Finestrat, Balcón de Finestrat",
  price: 700000,
  bedrooms: 3,
  bathrooms: 2,
  areaM2: 150,
  plotM2: 400,
  propertyType: "Villa",
  imageUrl: null,
  ...overrides,
});

test("detects large area differences at nearly identical price", () => {
  const opportunities = detectPropertyEditorialOpportunities([
    p({ id:"1", ref:"A1", price:735000, areaM2:202 }),
    p({ id:"2", ref:"A2", price:735950, areaM2:128 }),
  ]);
  const hit = opportunities.find((item)=>item.opportunityType === "same_price_area_gap");
  assert.ok(hit);
  assert.ok(hit.score >= 80);
  assert.deepEqual(hit.propertyRefs, ["A1","A2"]);
  assert.match(hit.draftMarkdown, /Markedsøyeblikksbilde/);
});

test("detects cross-area same-budget decisions", () => {
  const opportunities = detectPropertyEditorialOpportunities([
    p({ id:"1", ref:"B1", town:"Benidorm", location:"Benidorm", price:594000, areaM2:178, propertyType:"Villa" }),
    p({ id:"2", ref:"B2", town:"Finestrat", location:"Finestrat", price:604000, areaM2:130, propertyType:"Penthouse" }),
  ]);
  assert.ok(opportunities.some((item)=>item.opportunityType === "cross_area_same_budget"));
});

test("ignores properties outside Costa Blanca North and large price gaps", () => {
  const opportunities = detectPropertyEditorialOpportunities([
    p({ id:"1", ref:"C1", town:"Torrevieja", location:"Torrevieja", price:300000 }),
    p({ id:"2", ref:"C2", town:"Finestrat", price:700000 }),
  ]);
  assert.equal(opportunities.length, 0);
});
