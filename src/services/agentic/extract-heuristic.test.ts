import assert from "node:assert/strict";
import test from "node:test";
import { heuristicExtract, parseBudgetEur } from "@/services/agentic/extract-heuristic";

test("parseBudgetEur: 450k → 450000", () => {
  assert.equal(parseBudgetEur("budsjett rundt 450k euro"), 450_000);
});
test("parseBudgetEur: gruppert 450 000 / 450.000", () => {
  assert.equal(parseBudgetEur("maks 450 000"), 450_000);
  assert.equal(parseBudgetEur("€450.000"), 450_000);
});
test("parseBudgetEur: ingen budsjett → undefined", () => {
  assert.equal(parseBudgetEur("ser etter noe fint"), undefined);
});

test("heuristicExtract: villa i Albir, 3 soverom, 450k", () => {
  const r = heuristicExtract({ source: "web", contactName: "Harald", message: "villa i Albir eller Finestrat, minst 3 soverom, budsjett 450k" });
  assert.equal(r.profile.budgetMaxEur, 450_000);
  assert.deepEqual(r.profile.areas.sort(), ["Albir", "Finestrat"]);
  assert.equal(r.profile.propertyType, "villa");
  assert.equal(r.profile.bedroomsMin, 3);
  assert.ok(r.confidence >= 0.5);
});

test("heuristicExtract: vagt → lav confidence", () => {
  const r = heuristicExtract({ source: "web", message: "hei, har dere noe til salgs?" });
  assert.ok(r.confidence < 0.5);
});
