import assert from "node:assert/strict";
import test from "node:test";
import { buildQualityPrompt, manuscriptForReview } from "./book-quality-reviewer";

test("quality reviewer builds a bounded, traceable manuscript input", () => {
  const manuscript = manuscriptForReview([{ chapter_title: "One", draft: "A".repeat(20) }, { chapter_title: "Two", draft: "B".repeat(20) }], 30);
  assert.equal(manuscript.text.length, 30);
  assert.equal(manuscript.truncated, true);
  assert.ok(manuscript.totalChars > manuscript.text.length);
});

test("quality prompt forbids model self-approval and includes canon", () => {
  const prompt = buildQualityPrompt({ type: "canon_consistency", title: "Book", manuscript: "Draft", canon: { rule: "Evelyn is alive" }, coverage: { totalChars: 5, truncated: false } });
  assert.match(prompt, /Ikke godkjenn boken/);
  assert.match(prompt, /Evelyn is alive/);
  assert.match(prompt, /Manusdekning/);
});
