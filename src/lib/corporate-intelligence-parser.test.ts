import assert from "node:assert/strict";
import test from "node:test";
import { extractCorporateResearchJsonArray, summarizeIntelligenceForAccount } from "./corporate-intelligence";

test("Corporate research JSON parser ignores appended Perplexity source list", () => {
  const parsed = extractCorporateResearchJsonArray(
    '[{"signalType":"hiring_growth","title":"Hiring","summary":"Growth","sourceUrl":"https://example.no/news"}]\\n\\nKilder:\\n[1] https://example.no/news\\n[2] https://example.no/report',
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].signalType, "hiring_growth");
});

test("Corporate research JSON parser handles fenced arrays", () => {
  const parsed = extractCorporateResearchJsonArray(
    '```json\\n[{"signalType":"financial_strength","title":"Strong","summary":"Result","sourceUrl":"https://example.no/report"}]\\n```',
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, "Strong");
});


test("Intelligence summary excludes historical and ignored findings from Nexus impact", () => {
  const summary = summarizeIntelligenceForAccount([
    {
      id: "current",
      active: true,
      review_status: "PENDING",
      change_status: "NEW",
      direction: "POSITIVE",
      relevance: 90,
      confidence: 90,
      fit_delta: 5,
      timing_delta: 4,
      intent_delta: 2,
      financial_capacity_delta: 1,
      evidence: { historical: false },
    },
    {
      id: "historic",
      active: true,
      review_status: "PENDING",
      change_status: "NEW",
      direction: "POSITIVE",
      relevance: 70,
      confidence: 90,
      fit_delta: 10,
      timing_delta: 10,
      intent_delta: 10,
      financial_capacity_delta: 10,
      evidence: { historical: true },
    },
    {
      id: "ignored-negative",
      active: true,
      review_status: "IGNORED",
      change_status: "NEW",
      direction: "NEGATIVE",
      relevance: 99,
      confidence: 99,
      fit_delta: -10,
      timing_delta: -15,
      intent_delta: -10,
      evidence: { historical: false },
    },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.effectiveTotal, 1);
  assert.equal(summary.reviewPending, 2);
  assert.equal(summary.ignoredOrOutdated, 1);
  assert.equal(summary.historical, 1);
  assert.equal(summary.negativeSignals, 0);
  assert.deepEqual(summary.deltas, { fit: 5, timing: 4, intent: 2, financialCapacity: 1 });
  assert.deepEqual(summary.topChanges.map((item: any) => item.id), ["current"]);
});
