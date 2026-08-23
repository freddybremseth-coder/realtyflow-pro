import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateExperiment,
  experimentEvidence,
  structuralFingerprint,
  validateExperimentDefinition,
  type ExperimentDefinition,
} from "@/lib/marketing/experiment";
import type { ContentGenome } from "@/lib/marketing/genome";

const g = (over: Partial<ContentGenome>): ContentGenome => ({ brandId: "b1", channel: "instagram", format: "reel", ...over });

test("normaliserer per observasjon: mindre arm med høyere rate vinner", () => {
  const def: ExperimentDefinition = {
    experimentId: "e1",
    hypothesis: "B konverterer bedre per innhold",
    controlVariantId: "A",
    variants: [
      { variantId: "A", metrics: { leads: 50 }, sample: 100 }, // total BV 1000, per obs 10
      { variantId: "B", metrics: { leads: 40 }, sample: 20 },  // total BV 800, per obs 40
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "won");
  assert.equal(r.winnerVariantId, "B"); // per observasjon, ikke total
  const a = r.variants.find((v) => v.variantId === "A")!;
  const b = r.variants.find((v) => v.variantId === "B")!;
  assert.ok(a.metricTotal > b.metricTotal); // A har størst total …
  assert.ok(b.metricPerObservation > a.metricPerObservation); // … men B vinner på rate
});

test("equalExposure sammenligner totaler (motsatt vinner)", () => {
  const def: ExperimentDefinition = {
    experimentId: "e1b",
    hypothesis: "h",
    controlVariantId: "A",
    equalExposure: true,
    variants: [
      { variantId: "A", metrics: { leads: 50 }, sample: 100 },
      { variantId: "B", metrics: { leads: 40 }, sample: 20 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.winnerVariantId, "A"); // total BV 1000 > 800
});

test("needs_more_data ved for lite utvalg (winnerId null)", () => {
  const def: ExperimentDefinition = {
    experimentId: "e2", hypothesis: "h",
    variants: [{ variantId: "A", metrics: { leads: 1 }, sample: 2 }, { variantId: "B", metrics: { leads: 9 }, sample: 2 }],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "needs_more_data");
  assert.equal(r.winnerVariantId, null);
  assert.equal(r.canAutoLearn, false);
});

test("n=5/8 (directional) kårer signal-vinner men mater IKKE learning autonomt", () => {
  const def: ExperimentDefinition = {
    experimentId: "e3", hypothesis: "h", controlVariantId: "A",
    variants: [
      { variantId: "A", genome: g({ hookType: "question" }), metrics: { leads: 1 }, sample: 8 },
      { variantId: "B", genome: g({ hookType: "price_first" }), metrics: { leads: 8, qualifiedLeads: 4 }, sample: 8 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "won");
  assert.equal(r.confidence, "directional");
  assert.equal(r.canAutoLearn, false); // krever minst reliable
  assert.equal(experimentEvidence(def, r), null);
});

test("reliable (>=25 obs) mater learning autonomt med testet dimensjon", () => {
  const def: ExperimentDefinition = {
    experimentId: "e4", hypothesis: "price_first vinner", controlVariantId: "A", primaryVariable: "hookType",
    variants: [
      { variantId: "A", genome: g({ hookType: "question" }), metrics: { leads: 10 }, sample: 30 },
      { variantId: "B", genome: g({ hookType: "price_first" }), metrics: { leads: 40, qualifiedLeads: 20 }, sample: 30 },
    ],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "won");
  assert.equal(r.canAutoLearn, true);
  const ev = experimentEvidence(def, r)!;
  assert.equal(ev.dimension, "hookType");
  assert.equal(ev.value, "price_first");
  assert.ok(ev.normalizedLift > 1.1);
});

test("inconclusive: like rater gir ingen vinner og ingen evidens", () => {
  const def: ExperimentDefinition = {
    experimentId: "e5", hypothesis: "h", controlVariantId: "A",
    variants: [{ variantId: "A", metrics: { leads: 30 }, sample: 30 }, { variantId: "B", metrics: { leads: 30 }, sample: 30 }],
  };
  const r = evaluateExperiment(def);
  assert.equal(r.outcome, "inconclusive");
  assert.equal(experimentEvidence(def, r), null);
});

test("runtime-guard: for kort kjøretid → needs_more_data", () => {
  const started = "2026-08-23T10:00:00Z";
  const def: ExperimentDefinition = {
    experimentId: "e6", hypothesis: "h", controlVariantId: "A", minRuntimeHours: 48, startedAt: started,
    variants: [{ variantId: "A", metrics: { leads: 10 }, sample: 30 }, { variantId: "B", metrics: { leads: 40 }, sample: 30 }],
  };
  const tooEarly = evaluateExperiment(def, "2026-08-24T10:00:00Z"); // 24t < 48t
  assert.equal(tooEarly.outcome, "needs_more_data");
  const later = evaluateExperiment(def, "2026-08-26T10:00:00Z"); // 72t
  assert.equal(later.outcome, "won");
});

test("suksessmetrikk sales vinner på salg, ikke views", () => {
  const def: ExperimentDefinition = {
    experimentId: "e7", hypothesis: "h", successMetric: "sales", controlVariantId: "A",
    variants: [{ variantId: "A", metrics: { sales: 1, views: 100000 }, sample: 30 }, { variantId: "B", metrics: { sales: 6, views: 2000 }, sample: 30 }],
  };
  assert.equal(evaluateExperiment(def).winnerVariantId, "B");
});

test("guardrail: ulik kanal uten primaryVariable=channel er brudd", () => {
  const def: ExperimentDefinition = {
    experimentId: "e8", hypothesis: "h", controlVariantId: "A", primaryVariable: "hookType",
    variants: [
      { variantId: "A", genome: g({ channel: "instagram", hookType: "question" }), metrics: {}, sample: 5 },
      { variantId: "B", genome: g({ channel: "youtube", hookType: "price_first" }), metrics: {}, sample: 5 },
    ],
  };
  const v = validateExperimentDefinition(def);
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((s) => s.includes("channel")));
});

test("guardrail: primaryVariable satt, men flere variabler endret er brudd", () => {
  const def: ExperimentDefinition = {
    experimentId: "e9", hypothesis: "h", controlVariantId: "A", primaryVariable: "hookType",
    variants: [
      { variantId: "A", genome: g({ hookType: "question", format: "reel" }), metrics: {}, sample: 5 },
      { variantId: "B", genome: g({ hookType: "price_first", format: "carousel" }), metrics: {}, sample: 5 },
    ],
  };
  const v = validateExperimentDefinition(def);
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((s) => s.includes("flere variabler")));
});

test("guardrail: ren A/B (kun hookType skiller) er gyldig", () => {
  const def: ExperimentDefinition = {
    experimentId: "e10", hypothesis: "h", controlVariantId: "A", primaryVariable: "hookType",
    variants: [
      { variantId: "A", genome: g({ hookType: "question" }), metrics: {}, sample: 5 },
      { variantId: "B", genome: g({ hookType: "price_first" }), metrics: {}, sample: 5 },
    ],
  };
  assert.equal(validateExperimentDefinition(def).ok, true);
});

test("fingeravtrykk endres av design (genome), ikke av data (metrics/sample)", () => {
  const base: ExperimentDefinition = {
    experimentId: "e11", hypothesis: "h", controlVariantId: "A", primaryVariable: "hookType",
    variants: [
      { variantId: "A", genome: g({ hookType: "question" }), metrics: { leads: 1 }, sample: 5 },
      { variantId: "B", genome: g({ hookType: "price_first" }), metrics: { leads: 2 }, sample: 5 },
    ],
  };
  const fp = structuralFingerprint(base);
  const moreData = { ...base, variants: base.variants.map((v) => ({ ...v, metrics: { leads: 999 }, sample: 500 })) };
  assert.equal(structuralFingerprint(moreData), fp); // data endrer ikke design
  const changedDesign = { ...base, variants: [base.variants[0], { ...base.variants[1], genome: g({ hookType: "lifestyle_first" }) }] };
  assert.notEqual(structuralFingerprint(changedDesign), fp); // genome endrer design
});

test("krever minst 2 varianter", () => {
  assert.throws(() => evaluateExperiment({ experimentId: "x", hypothesis: "h", variants: [{ variantId: "A", metrics: {}, sample: 5 }] }));
});
