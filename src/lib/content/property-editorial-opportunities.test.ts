import assert from "node:assert/strict";
import test from "node:test";
import { detectPropertyEditorialOpportunities, selectDiversePropertyEditorialOpportunities, type EditorialPropertyFact } from "./property-editorial-opportunities";

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


test("limits one area from dominating the editorial queue", () => {
  const finestrat = [
    p({ id:"f1", ref:"F1", price:700000, areaM2:300 }),
    p({ id:"f2", ref:"F2", price:701000, areaM2:120 }),
    p({ id:"f3", ref:"F3", price:702000, areaM2:280 }),
    p({ id:"f4", ref:"F4", price:703000, areaM2:125 }),
    p({ id:"f5", ref:"F5", price:704000, areaM2:260 }),
  ];
  const other = [
    p({ id:"v1", ref:"V1", town:"Villajoyosa", location:"Villajoyosa", price:500000, areaM2:180 }),
    p({ id:"v2", ref:"V2", town:"Villajoyosa", location:"Villajoyosa", price:501000, areaM2:90 }),
  ];
  const opportunities = detectPropertyEditorialOpportunities([...finestrat, ...other], 12);
  const finestratOnly = opportunities.filter((item) => {
    const rows = Array.isArray(item.evidence.properties) ? item.evidence.properties : [];
    return rows.every((row) => row && typeof row === "object" && String((row as EditorialPropertyFact).town) === "Finestrat");
  });
  assert.ok(finestratOnly.length <= 3);
  assert.ok(opportunities.some((item) => item.propertyRefs.includes("V1") && item.propertyRefs.includes("V2")));
});


test("rejects inconsistent normalized town and source location", () => {
  const opportunities = detectPropertyEditorialOpportunities([
    p({ id:"m1", ref:"M1", town:"Dénia", location:"El Verger, El Verger", price:470000, areaM2:97 }),
    p({ id:"m2", ref:"M2", town:"Polop", location:"Polop, Urbanizaciones", price:470000, areaM2:200 }),
  ]);
  assert.equal(opportunities.length, 0);
});


test("diversifies the visible queue across properties and areas before relaxing", () => {
  const row = (
    id: string,
    score: number,
    refs: string[],
    town: string,
  ) => ({
    id,
    opportunityType: "same_price_area_gap",
    score,
    title: id,
    propertyRefs: refs,
    evidence: { properties: refs.map(ref => ({ ref, town, location: town })) },
  });

  const visible = selectDiversePropertyEditorialOpportunities([
    row("a", 99, ["P1", "P2"], "Finestrat"),
    row("b", 98, ["P1", "P3"], "Finestrat"),
    row("c", 97, ["P4", "P5"], "Finestrat"),
    row("d", 96, ["V1", "V2"], "Villajoyosa"),
    row("e", 95, ["L1", "L2"], "La Nucía"),
    row("f", 94, ["C1", "C2"], "Calpe"),
  ], 4);

  assert.equal(visible.length, 4);
  assert.deepEqual(visible.map(item => item.id), ["a", "c", "d", "e"]);
  assert.equal(visible.filter(item => item.propertyRefs.includes("P1")).length, 1);
  assert.ok(!visible.some(item => item.id === "b"));
});


test("detects three-property budget-band clusters with meaningful differences", () => {
  const opportunities = detectPropertyEditorialOpportunities([
    p({ id:"x1", ref:"X1", town:"Benidorm", location:"Benidorm", price:594000, areaM2:178, propertyType:"Villa" }),
    p({ id:"x2", ref:"X2", town:"Polop", location:"Polop", price:602000, areaM2:145, propertyType:"Villa" }),
    p({ id:"x3", ref:"X3", town:"Finestrat", location:"Finestrat", price:604000, areaM2:130, propertyType:"Penthouse" }),
  ], 20);
  const cluster = opportunities.find((item) => item.opportunityType === "budget_band_cluster");
  assert.ok(cluster);
  assert.equal(cluster.propertyRefs.length, 3);
  assert.match(cluster.draftMarkdown, /Boligene side ved side/);
});
