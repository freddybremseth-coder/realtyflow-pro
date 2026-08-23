import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateExperiment,
  experimentToLearningObservation,
  type ExperimentDefinition,
} from "@/lib/marketing/experiment";
import type { ContentGenome } from "@/lib/marketing/genome";

const g = (over: Partial<ContentGenome>): ContentGenome => ({ brandId: "b1", channel: "instagram", format: "reel", ...over });

test("kårer vinner på business value når evidens + løft er der", () => {
  const def: ExperimentDefinition = {
    experimentId: "e1",
    hypothesis: "price_first-hook gir flere leads",
    variants: [
      { variantId: "A", label: "question", metrics: { views: 5000, leads: 1 }, sample: 8 },
      { variantId: "B", label: "price_first", genome: g({ hookType: "price_first" }), metrics: { views: 3000, leads: 6, qualifiedLeads: 3 }, sample: 8 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "won");
  assert.equal(r.winnerVariantId, "B");
  assert.ok(r.winnerLift > 1.1);
});

test("needs_more_data: for lite utvalg hindrer tidlig konklusjon", () => {
  const def: ExperimentDefinition = {
    experimentId: "e2",
    hypothesis: "h",
    variants: [
      { variantId: "A", metrics: { leads: 1 }, sample: 2 },
      { variantId: "B", metrics: { leads: 9 }, sample: 2 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "needs_more_data");
  assert.equal(r.winnerVariantId, null);
  assert.equal(r.confidence, "insufficient");
});

test("inconclusive: ingen variant slår kontroll nok", () => {
  const def: ExperimentDefinition = {
    experimentId: "e3",
    hypothesis: "h",
    variants: [
      { variantId: "A", metrics: { leads: 10 }, sample: 10 },
      { variantId: "B", metrics: { leads: 10 }, sample: 10 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "inconclusive");
  assert.equal(r.winnerVariantId, null);
});

test("kontroll kan vinne når utfordreren er klart svakere", () => {
  const def: ExperimentDefinition = {
    experimentId: "e4",
    hypothesis: "ny hook slår dagens",
    controlVariantId: "A",
    variants: [
      { variantId: "A", label: "dagens", metrics: { leads: 10, qualifiedLeads: 5 }, sample: 12 },
      { variantId: "B", label: "ny", metrics: { views: 2000 }, sample: 12 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "won");
  assert.equal(r.winnerVariantId, "A");
});

test("suksessmetrikk kan være sales", () => {
  const def: ExperimentDefinition = {
    experimentId: "e5",
    hypothesis: "h",
    successMetric: "sales",
    variants: [
      { variantId: "A", metrics: { sales: 1, views: 100000 }, sample: 8 },
      { variantId: "B", metrics: { sales: 3, views: 2000 }, sample: 8 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.winnerVariantId, "B"); // salg, ikke views
});

test("tilbakeføring til learning kun ved klar vinner med genome", () => {
  const won: ExperimentDefinition = {
    experimentId: "e6",
    hypothesis: "h",
    variants: [
      { variantId: "A", metrics: { leads: 1 }, sample: 8 },
      { variantId: "B", genome: g({ hookType: "price_first" }), metrics: { leads: 8, qualifiedLeads: 4 }, sample: 8 },
    ],
  };
  const r = evaluateExperiment(won);
  const obs = experimentToLearningObservation(won, r);
  assert.ok(obs);
  assert.equal(obs!.genome.hookType, "price_first");

  const inc = evaluateExperiment({ ...won, variants: [
    { variantId: "A", metrics: { leads: 5 }, sample: 8 },
    { variantId: "B", genome: g({ hookType: "price_first" }), metrics: { leads: 5 }, sample: 8 },
  ] });
  assert.equal(experimentToLearningObservation(won, inc), null);
});

test("krever minst 2 varianter", () => {
  assert.throws(() => evaluateExperiment({ experimentId: "x", hypothesis: "h", variants: [{ variantId: "A", metrics: {}, sample: 5 }] }));
});
