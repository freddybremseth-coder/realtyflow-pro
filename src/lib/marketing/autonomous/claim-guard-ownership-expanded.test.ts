import assert from "node:assert/strict";
import test from "node:test";
import { findOwnershipClaims } from "./claim-guard";

test("advisor brands cannot claim ownership of projects or complexes", () => {
  const cases = [
    "Velkommen til vårt boligprosjekt i Finestrat.",
    "Se vårt boligkompleks i Campoamor.",
    "Dette er vårt prosjekt på Costa Blanca.",
    "Discover our residential project in Spain.",
    "Explore our residential complex near the beach.",
  ];

  for (const caption of cases) {
    assert.ok(findOwnershipClaims(caption).length > 0, caption);
  }
});

test("advisor-safe presentation language is not treated as ownership", () => {
  for (const caption of [
    "Vi presenterer et boligprosjekt i Finestrat.",
    "Boligene vi formidler ligger i Campoamor.",
    "We present a residential project on Costa Blanca.",
  ]) {
    assert.deepEqual(findOwnershipClaims(caption), [], caption);
  }
});
