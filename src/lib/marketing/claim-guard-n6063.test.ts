import assert from "node:assert/strict";
import test from "node:test";
import { unsupportedOutcomeClaims } from "./autonomous/claim-guard";

const facts = [
  { claim: "Referanse: N6063", source: "RealtyFlow Inventory" },
  { claim: "Boligtype: Townhouse", source: "RealtyFlow Inventory" },
  { claim: "Sted: Gran Alacant", source: "RealtyFlow Inventory" },
  { claim: "Region: Costa Blanca South", source: "RealtyFlow Inventory" },
  { claim: "Pris: €410000", source: "RealtyFlow Inventory" },
  { claim: "Soverom: 3", source: "RealtyFlow Inventory" },
  { claim: "Bad: 3", source: "RealtyFlow Inventory" },
  { claim: "Energimerking: B", source: "RealtyFlow Inventory" },
  { claim: "Nybyggprosjekt", source: "RealtyFlow Inventory" },
];

test("N6063 source-bound Inventory copy rejects unsupported sales filler", () => {
  const caption = [
    "Oppdag ditt nye hjem i Gran Alacant!",
    "Vi presenterer et flott rekkehus med 3 soverom og 3 bad i Gran Alacant, Costa Blanca South.",
    "Dette nybyggprosjektet tilbyr moderne fasiliteter og energimerking B, perfekt for både ferie og permanent opphold.",
    "Med en pris på €410000, gir denne boligen deg en mulighet til å oppleve livet i solen.",
  ].join(" ");

  const unsupported = unsupportedOutcomeClaims(caption, facts, { inventoryBound: true });
  assert.ok(unsupported.includes("new-home framing"));
  assert.ok(unsupported.includes("subjective property praise"));
  assert.ok(unsupported.includes("modern amenities"));
  assert.ok(unsupported.includes("holiday-and-permanent suitability"));
  assert.ok(unsupported.includes("life-in-the-sun lifestyle"));
});

test("N6063 factual Inventory copy remains valid", () => {
  const caption = "Rekkehus med 3 soverom og 3 bad i Gran Alacant, Costa Blanca South. Nybyggprosjekt. Energimerking B. Pris €410000.";
  assert.deepEqual(unsupportedOutcomeClaims(caption, facts, { inventoryBound: true }), []);
});