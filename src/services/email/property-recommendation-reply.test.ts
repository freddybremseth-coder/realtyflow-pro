import assert from "node:assert/strict";
import test from "node:test";
import { analyzePropertyRecommendationReply } from "./property-recommendation-reply";

const properties = [
  { propertyId: "p1", reference: "N1001", title: "Villa i Moraira", location: "Moraira", imageUrl: null, publicUrl: "https://example.test/1", facts: [], decision: "current", systemEligibility: "eligible", score: 90, dataQualityScore: 90, reasons: [], concerns: [], questionsToVerify: [] },
  { propertyId: "p2", reference: "N1002", title: "Villa i Altea", location: "Altea", imageUrl: null, publicUrl: "https://example.test/2", facts: [], decision: "current", systemEligibility: "eligible", score: 88, dataQualityScore: 90, reasons: [], concerns: [], questionsToVerify: [] },
  { propertyId: "p3", reference: "N1003", title: "Villa i Calpe", location: "Calpe", imageUrl: null, publicUrl: "https://example.test/3", facts: [], decision: "current", systemEligibility: "eligible", score: 84, dataQualityScore: 88, reasons: [], concerns: [], questionsToVerify: [] },
];

test("understands separate feedback for numbered properties", () => {
  const result = analyzePropertyRecommendationReply({
    body: "Nr 2 er interessant. Nr 1 blir for dyr. Jeg liker ikke området på nr 3.",
    properties,
  });
  assert.equal(result.signals.length, 3);
  assert.equal(result.signals.find((item) => item.ordinal === 2)?.sentiment, "positive");
  assert.deepEqual(result.signals.find((item) => item.ordinal === 1)?.reasons, ["price_high"]);
  assert.deepEqual(result.signals.find((item) => item.ordinal === 3)?.reasons, ["location_dislike"]);
  assert.equal(result.shouldRematch, true);
  assert.equal(result.requiresBuyerProfileReview, true);
});

test("maps explicit property references and viewing intent", () => {
  const result = analyzePropertyRecommendationReply({
    body: "N1002 ser bra ut. Kan vi se boligen på torsdag?",
    properties,
  });
  assert.equal(result.signals.some((item) => item.reference === "N1002" && item.sentiment === "positive"), true);
});

test("extracts explicit new criteria without silently applying them", () => {
  const result = analyzePropertyRecommendationReply({
    body: "Nr 1 er for dyr. Maks budsjett er 550000. Vi vil ha minst 3 soverom.",
    properties,
  });
  assert.equal(result.requiresBuyerProfileReview, true);
  assert.equal(result.explicitCriteriaEvidence.some((item) => /550000/.test(item.replace(/\s/g, ""))), true);
  assert.equal(result.explicitCriteriaEvidence.some((item) => /3\s*soverom/i.test(item)), true);
});

test("quoted outbound text is ignored", () => {
  const result = analyzePropertyRecommendationReply({
    body: "Nr 2 er interessant.\n\nFra: Freddy\nNr 1 er interessant og nr 3 er interessant.",
    properties,
  });
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].ordinal, 2);
});
