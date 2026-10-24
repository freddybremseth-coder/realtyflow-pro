import assert from "node:assert/strict";
import { test } from "node:test";
import { editorialReviewSimilarity, editorialTextSimilarity } from "./property-editorial-similarity";

test("nearly identical long introductions are flagged even on different property IDs", () => {
  const intro = "Leiligheten har tre soverom og terrasse med adkomst fra stuen. Parkering er oppgitt som en del av prosjektet.";
  const other = { id: "b", editorial_no: { intro_no: intro, bullets_no: ["Felles basseng ved boligen"] } };
  const result = editorialReviewSimilarity("a", { intro_no: intro, bullets_no: ["Felles basseng ved boligen"] }, [other]);
  assert.equal(result?.similarTo, "b");
});
test("different property facts do not trigger similarity warning", () => {
  assert.equal(editorialTextSimilarity("Villa med privat basseng og garasje i Polop.", "Leilighet i første etasje med felles hage i Alicante."), 0);
});
test("the same property is not considered a duplicate of itself", () => {
  const intro = "Boligen har privat basseng og en stor terrasse med kjøkken og parkering ved inngangen.";
  assert.equal(editorialReviewSimilarity("a", { intro_no: intro, bullets_no: [] }, [{ id: "a", editorial_no: { intro_no: intro, bullets_no: [] } }]), null);
});
