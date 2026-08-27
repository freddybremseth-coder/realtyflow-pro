import assert from "node:assert/strict";
import test from "node:test";
import type { BuyerLifestylePreference } from "./nexus-buyer-lifestyle";
import { rankAreasByLifestyle, scoreAreaLifestyleMatch } from "./nexus-area-lifestyle-match";

function preference(
  key: `${BuyerLifestylePreference["namespace"]}:${string}`,
  strength: BuyerLifestylePreference["strength"] = "strong_preference",
): BuyerLifestylePreference {
  const [namespace, ...dimension] = key.split(":");
  return {
    namespace: namespace as BuyerLifestylePreference["namespace"],
    dimension: dimension.join(":"),
    value: true,
    strength,
    evidence: "customer_confirmed",
    confidence: 0.95,
    confirmed: true,
    sourceText: null,
  };
}

test("scores explicit area evidence for confirmed lifestyle preferences", () => {
  const result = scoreAreaLifestyleMatch(
    {
      id: "albir",
      name: "Albir",
      lifestyle: "A walkable coastal area with restaurants and cafés. The beach is within walking distance.",
      highlights: ["Public transport and everyday services nearby"],
    },
    [
      preference("mobility:walkable", "must_have"),
      preference("daily_life:beach_walkability", "strong_preference"),
      preference("lifestyle:restaurants_cafes", "nice_to_have"),
    ],
  );

  assert.equal(result.matched, 3);
  assert.equal(result.conflicts, 0);
  assert.equal(result.unknown, 0);
  assert.ok(result.score > 50);
  assert.equal(result.confidence, 100);
});

test("does not convert missing area evidence into a negative match", () => {
  const result = scoreAreaLifestyleMatch(
    { name: "Sparse Area", description: "A residential area on the Costa Blanca." },
    [preference("lifestyle:golf", "must_have")],
  );

  assert.equal(result.score, 0);
  assert.equal(result.unknown, 1);
  assert.equal(result.conflicts, 0);
  assert.equal(result.dimensions[0]?.outcome, "unknown");
});

test("surfaces explicit conflict for quiet preference without treating it as hard property rejection", () => {
  const result = scoreAreaLifestyleMatch(
    { name: "Centre", lifestyle: "A lively nightlife district with a busy party atmosphere." },
    [preference("environment:quiet", "must_have")],
  );

  assert.equal(result.conflicts, 1);
  assert.equal(result.dimensions[0]?.outcome, "conflict");
  assert.equal(result.dimensions[0]?.score, 0);
});

test("ranks areas by lifestyle evidence and then confidence", () => {
  const ranked = rankAreasByLifestyle(
    [
      { id: "quiet", name: "Quiet Hills", lifestyle: "Peaceful residential setting in the hills." },
      { id: "lively", name: "Lively Centre", lifestyle: "Vibrant nightlife and busy city centre." },
      { id: "unknown", name: "Unknown", description: "Costa Blanca area." },
    ],
    [preference("environment:quiet", "must_have")],
  );

  assert.equal(ranked[0]?.areaId, "quiet");
  assert.equal(ranked.at(-1)?.areaId, "unknown");
});
