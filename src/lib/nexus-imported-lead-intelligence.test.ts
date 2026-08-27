import assert from "node:assert/strict";
import test from "node:test";
import { buildImportedLeadIntelligence } from "./nexus-imported-lead-intelligence";

test("extracts explicit lifestyle evidence from imported form text", () => {
  const result = buildImportedLeadIntelligence({
    type: "buyer",
    property_interest: "Leilighet i Albir",
    notes: "Pensjonist. Ønsker gangavstand til strand og restauranter. Flatt terreng og gjerne norsk miljø.",
  });

  const keys = new Set(result.lifestyleCandidates.map((item) => item.key));
  assert.equal(keys.has("lifestyle:beach"), true);
  assert.equal(keys.has("daily_life:beach_walkability"), true);
  assert.equal(keys.has("daily_life:restaurants_walkability"), true);
  assert.equal(keys.has("mobility:flat_terrain"), true);
  assert.equal(keys.has("social:scandinavian"), true);
  assert.equal(result.personaCandidates.some((item) => item.id === "retiree"), true);
  assert.equal(result.persistenceRecommended, false);
});

test("does not invent personas when the form contains no evidence", () => {
  const result = buildImportedLeadIntelligence({
    type: "buyer",
    notes: "Kontaktet på messe. Ring senere.",
  });
  assert.deepEqual(result.lifestyleCandidates, []);
  assert.deepEqual(result.personaCandidates, []);
});

test("investor and rental use remain explicit evidence-backed candidates", () => {
  const result = buildImportedLeadIntelligence({
    type: "investor",
    notes: "Ser etter investering for utleie og god yield.",
  });
  assert.equal(result.personaCandidates.some((item) => item.id === "investor"), true);
  assert.equal(result.lifestyleCandidates.some((item) => item.key === "residence:rental_use"), true);
  assert.equal(result.lifestyleCandidates.every((item) => item.customerConfirmed), true);
});
