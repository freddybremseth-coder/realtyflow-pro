import assert from "node:assert/strict";
import test from "node:test";
import {
  applyExperimentEvidence,
  baselineBusinessValue,
  classifyOutcomeTier,
  contentRecipeValue,
  deriveLearningRules,
  parseContentRecipe,
  recommendGenome,
  type ExperimentEvidence,
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

test("hashtags below five observations stay neutral and insufficient", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 4; i++) data.push(obs({ tags: ["costablanca"] }, { sales: 1 }));
  for (let i = 0; i < 6; i++) data.push(obs({ tags: ["finestrat"] }, {}));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const tag = rules.find((r) => r.dimension === "tag" && r.value === "costablanca")!;
  assert.equal(tag.sample, 4);
  assert.equal(tag.evidence, "insufficient");
  assert.equal(tag.verdict, "neutral");
});

test("hashtags stay neutral at five observations despite directional evidence", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 5; i++) data.push(obs({ tags: ["costablanca"] }, { sales: 1, qualifiedLeads: 2 }));
  for (let i = 0; i < 5; i++) data.push(obs({ tags: ["generic"] }, {}));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const costa = rules.find((r) => r.dimension === "tag" && r.value === "costablanca")!;
  assert.equal(costa.sample, 5);
  assert.notEqual(costa.evidence, "insufficient");
  assert.equal(costa.verdict, "neutral");
});

test("hashtags become actionable at ten observations", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 10; i++) data.push(obs({ tags: ["costablanca", "boligdrøm"] }, { sales: 1, qualifiedLeads: 2 }));
  for (let i = 0; i < 10; i++) data.push(obs({ tags: ["generic"] }, {}));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const costa = rules.find((r) => r.dimension === "tag" && r.value === "costablanca")!;
  const dream = rules.find((r) => r.dimension === "tag" && r.value === "boligdrøm")!;
  assert.equal(costa.sample, 10);
  assert.equal(costa.verdict, "favor");
  assert.equal(dream.verdict, "favor");
});

test("empty tag arrays do not create tag rules", () => {
  const rules = deriveLearningRules([obs({ tags: [] }, { sales: 1 })], { scope: "b1" });
  assert.equal(rules.some((r) => r.dimension === "tag"), false);
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

test("applyExperimentEvidence: oppgraderer verdict uten å røre revenue-totaler", () => {
  const data = [obs({ hookType: "price_first" }, { leads: 2, sales: 1 }), obs({ hookType: "price_first" }, { leads: 1 })];
  const rules = deriveLearningRules(data, { scope: "b1" });
  const before = rules.find((r) => r.dimension === "hookType" && r.value === "price_first")!;
  assert.equal(before.verdict, "neutral");
  const revenueBefore = before.totalSales;

  const ev: ExperimentEvidence[] = [{ scope: "b1", dimension: "hookType", value: "price_first", normalizedLift: 2.4, evidence: "reliable", experimentId: "e1" }];
  const merged = applyExperimentEvidence(rules, ev);
  const after = merged.find((r) => r.dimension === "hookType" && r.value === "price_first")!;
  assert.equal(after.verdict, "favor");
  assert.equal(after.experimentBacked, true);
  assert.equal(after.experimentLift, 2.4);
  assert.equal(after.totalSales, revenueBefore);
});

test("applyExperimentEvidence: kan opprette ren eksperiment-regel uten revenue", () => {
  const ev: ExperimentEvidence[] = [{ scope: "b1", dimension: "ctaType", value: "book_viewing", normalizedLift: 1.9, evidence: "strong", experimentId: "e2" }];
  const merged = applyExperimentEvidence([], ev);
  const rule = merged.find((r) => r.dimension === "ctaType" && r.value === "book_viewing")!;
  assert.equal(rule.verdict, "favor");
  assert.equal(rule.totalSales, 0);
  assert.equal(rule.totalLeads, 0);
});

test("recommendGenome foretrekker eksperiment-bekreftet regel", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 8; i++) data.push(obs({ hookType: "question" }, { leads: 3, views: 1000 }));
  for (let i = 0; i < 8; i++) data.push(obs({ hookType: "price_first" }, { leads: 2, views: 1000 }));
  let rules = deriveLearningRules(data, { scope: "b1" });
  rules = applyExperimentEvidence(rules, [{ scope: "b1", dimension: "hookType", value: "price_first", normalizedLift: 3.0, evidence: "strong", experimentId: "e3" }]);
  const rec = recommendGenome(rules);
  assert.equal(rec.favor.hookType?.value, "price_first");
  assert.equal(rec.favor.hookType?.experimentBacked, true);
});

test("sortering: sterkeste evidens først", () => {
  const data: LearningObservation[] = [];
  for (let i = 0; i < 60; i++) data.push(obs({ area: "finestrat" }, { leads: 1 }));
  for (let i = 0; i < 3; i++) data.push(obs({ area: "altea" }, { leads: 1 }));
  const rules = deriveLearningRules(data, { scope: "b1" });
  const areaRules = rules.filter((r) => r.dimension === "area");
  assert.equal(areaRules[0].evidence, "strong");
});


test("derived rule inherits the true evidence window from its own observations", () => {
  const data: LearningObservation[] = [
    {
      genome: g({ hookType: "price_first" }),
      metrics: { sales: 1 },
      evidenceFirstAt: "2026-07-01T10:00:00Z",
      evidenceLastAt: "2026-07-05T10:00:00Z",
    },
    {
      genome: g({ hookType: "price_first" }),
      metrics: { sales: 1 },
      evidenceFirstAt: "2026-07-10T10:00:00Z",
      evidenceLastAt: "2026-09-20T10:00:00Z",
    },
    {
      genome: g({ hookType: "question" }),
      metrics: {},
      evidenceFirstAt: "2026-09-25T10:00:00Z",
      evidenceLastAt: "2026-09-28T10:00:00Z",
    },
  ];

  const rule = deriveLearningRules(data, { scope: "b1", minSample: 1 })
    .find((item) => item.dimension === "hookType" && item.value === "price_first");
  assert.ok(rule);
  assert.equal(rule.evidenceFirstAt, "2026-07-01T10:00:00Z");
  assert.equal(rule.evidenceLastAt, "2026-09-20T10:00:00Z");
});

test("recalculation time is not part of the rule evidence window", () => {
  const rule = deriveLearningRules([
    {
      genome: g({ area: "finestrat" }),
      metrics: { leads: 1 },
      evidenceFirstAt: "2026-06-01T10:00:00Z",
      evidenceLastAt: "2026-06-15T10:00:00Z",
    },
  ], { scope: "b1", minSample: 1 }).find((item) => item.dimension === "area" && item.value === "finestrat");

  assert.ok(rule);
  assert.equal(rule.evidenceLastAt, "2026-06-15T10:00:00Z");
});


test("outcome tiers separate reach, traffic, leads, qualified pipeline and sales", () => {
  assert.equal(classifyOutcomeTier({ impressions: 10000 }), "reach");
  assert.equal(classifyOutcomeTier({ impressions: 1000, clicks: 20 }), "traffic");
  assert.equal(classifyOutcomeTier({ clicks: 5, leads: 1 }), "lead");
  assert.equal(classifyOutcomeTier({ leads: 2, qualifiedLeads: 1 }), "qualified_pipeline");
  assert.equal(classifyOutcomeTier({ qualifiedLeads: 1, sales: 1 }), "sale");
});

test("recommendation prefers qualified business outcome over larger reach-only lift", () => {
  const rules = deriveLearningRules([
    ...Array.from({ length: 6 }, () => obs({ hookType: "viral_reach" }, { impressions: 100000, clicks: 200 })),
    ...Array.from({ length: 6 }, () => obs({ hookType: "buyer_intent" }, { impressions: 2500, clicks: 20, qualifiedLeads: 1 })),
  ], { scope: "b1", favorLift: 0 });

  const rec = recommendGenome(rules, { dimensions: ["hookType"] });
  assert.equal(rec.favor.hookType?.value, "buyer_intent");
  assert.equal(rec.favor.hookType?.outcomeTier, "qualified_pipeline");
});

test("derived rules retain funnel evidence needed for Nexus channel and content learning", () => {
  const rules = deriveLearningRules([
    ...Array.from({ length: 6 }, () => obs(
      { ctaType: "book_viewing" },
      { impressions: 3000, clicks: 24, leads: 4, qualifiedLeads: 2, viewings: 1, offers: 1, sales: 1, commissionEur: 9000 },
    )),
  ], { scope: "b1", favorLift: 0 });

  const rule = rules.find((item) => item.dimension === "ctaType" && item.value === "book_viewing")!;
  assert.equal(rule.outcomeTier, "sale");
  assert.equal(rule.totalClicks, 144);
  assert.equal(rule.totalViewings, 6);
  assert.equal(rule.totalOffers, 6);
  assert.equal(rule.totalSales, 6);
});


test("content recipe round-trips the exact observed combination", () => {
  const genome = g({
    format: "reel",
    hookType: "price_first",
    ctaType: "book_viewing",
    contentPillar: "buyer_guides",
    topic: "finestrat_villas",
    area: "finestrat",
    propertyType: "villa",
  });
  const recipe = contentRecipeValue(genome);
  assert.ok(recipe);
  const parsed = parseContentRecipe(recipe);
  assert.equal(parsed?.channel, "instagram");
  assert.equal(parsed?.format, "reel");
  assert.equal(parsed?.hookType, "price_first");
  assert.equal(parsed?.ctaType, "book_viewing");
  assert.equal(parsed?.contentPillar, "buyer_guides");
  assert.equal(parsed?.topic, "finestrat_villas");
  assert.equal(parsed?.area, "finestrat");
  assert.equal(parsed?.propertyType, "villa");
});

test("learning favors an exact sale-backed content recipe instead of inventing a combination", () => {
  const winning = {
    format: "reel" as const,
    hookType: "price_first" as const,
    ctaType: "book_viewing" as const,
    contentPillar: "buyer_guides",
    topic: "finestrat_villas",
    area: "finestrat",
    propertyType: "villa",
  };
  const losing = {
    format: "reel" as const,
    hookType: "question" as const,
    ctaType: "learn_more" as const,
    contentPillar: "lifestyle",
    topic: "generic_costa_blanca",
    area: "costa_blanca",
    propertyType: "apartment",
  };
  const rules = deriveLearningRules([
    ...Array.from({ length: 25 }, () => obs(winning, { impressions: 2500, clicks: 30, qualifiedLeads: 1, sales: 1 })),
    ...Array.from({ length: 25 }, () => obs(losing, { impressions: 12000, clicks: 80 })),
  ], { scope: "b1:instagram" });

  const rec = recommendGenome(rules, { dimensions: ["recipe"] });
  assert.equal(rec.favor.recipe?.evidence, "reliable");
  assert.equal(rec.favor.recipe?.outcomeTier, "sale");
  const parsed = parseContentRecipe(rec.favor.recipe?.value);
  assert.equal(parsed?.topic, "finestrat_villas");
  assert.equal(parsed?.hookType, "price_first");
  assert.equal(parsed?.ctaType, "book_viewing");
  assert.equal(parsed?.propertyType, "villa");
});
