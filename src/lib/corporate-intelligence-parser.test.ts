import assert from "node:assert/strict";
import test from "node:test";
import { extractCorporateResearchJsonArray } from "./corporate-intelligence";

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
