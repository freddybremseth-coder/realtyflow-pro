import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineBusinessValue,
  deriveLearningRules,
  recommendGenome,
  type LearningObservation,
} from "@/lib/marketing/learning";
import type { ContentGenome } from "@/lib/marketing/genome";
import type { ContentMetrics } from "@/lib/marketing/value-score";

const g = (over: Partial<ContentGenome>): ContentGenome => ({ brandId: "b1", channel: "instagram", format: "reel", ...over });
const obs = (genome: Partial<ContentGenome>, metrics: ContentMetrics): LearningObservation => ({ genome: g(genome), metrics });

test("baseline = snitt business value per observasjon", () => {
  const base = baselineBusinessValue([obs({}, { sales: 1 }), obs({}, {})]);
  assert.equal(base, 500); // (1000 + 0) / 2
});

test("favor: høy-lift dimensjon med nok evidens", () => {
  // price_first-hook selger; question-hook gjør ikke.
  const data: LearningObservation[] = [];
  for (let i = 0; i < 6; i++) data.push(obs({ hookType: "price_first" }, { sales: 1, qualifiedLeads: 3, views: 1000 }));
  for (let i = 0; i < 6; i++) data.push(obs({ hookType: "question" }, { views: 5000 }));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const price = rules.find((r) => r.dimension === "hookType" && r.value === "price_first")!;
  assert.equal(price.verdict, "favor");
  assert.ok(price.lift > 1);
  assert.equal(price.totalSales, 6);
});

test("avoid: lav-lift dimensjon med nok evidens", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 6; i++) data.push(obs({ hookType: "price_first" }, { sales: 1 }));
  for (let i = 0; i < 6; i++) data.push(obs({ hookType: "question" }, { views: 100 }));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const q = rules.find((r) => r.dimension === "hookType" && r.value === "question")!;
  assert.equal(q.verdict, "avoid");
  assert.ok(q.lift <= 0.6);
});

test("neutral: for lite utvalg gir ikke handling (ingen overtilpasning)", () => {
  const data = [obs({ hookType: "price_first" }, { sales: 1 }), obs({ hookType: "question" }, {})];
  const rules = deriveLearningRules(data, { scope: "b1", minSample: 5 });
  const price = rules.find((r) => r.dimension === "hookType" && r.value === "price_first")!;
  assert.equal(price.verdict, "neutral");
  assert.equal(price.evidence, "insufficient");
});

test("ruleKey er stabil og idempotent: scope|dimension|value", () => {
  const rules = deriveLearningRules([obs({ hookType: "price_first" }, {})], { scope: "b1" });
  const r = rules.find((x) => x.dimension === "hookType")!;
  assert.equal(r.ruleKey, "b1|hookType|price_first");
});

test("recommendGenome: agent får favor + avoid før generering", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 8; i++) data.push(obs({ hookType: "price_first", format: "reel" }, { sales: 1, qualifiedLeads: 2, views: 1000 }));
  for (let i = 0; i < 8; i++) data.push(obs({ hookType: "question", format: "carousel" }, { views: 8000 }));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const rec = recommendGenome(rules);
  assert.equal(rec.favor.hookType?.value, "price_first");
  assert.ok(rec.avoid.some((a) => a.dimension === "hookType" && a.value === "question"));
});

test("tomt datasett gir trygg anbefaling, ingen krasj", () => {
  const rec = recommendGenome(deriveLearningRules([], {}));
  assert.equal(Object.keys(rec.favor).length, 0);
  assert.ok(rec.notes[0].includes("Ikke nok evidens"));
});

test("sortering: sterkeste evidens først", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 60; i++) data.push(obs({ area: "finestrat" }, { leads: 1 }));
  for (let i = 0; i < 3; i++) data.push(obs({ area: "altea" }, { leads: 1 }));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const areaRules = rules.filter((r) => r.dimension === "area");
  assert.equal(areaRules[0].evidence, "strong");
});
