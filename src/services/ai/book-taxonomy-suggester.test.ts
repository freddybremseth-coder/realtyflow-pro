import assert from "node:assert/strict";
import test from "node:test";
import { buildTaxonomyPrompt } from "./book-taxonomy-suggester";

test("taxonomy prompt requires current codes and keeps proposals human-gated", () => {
  const prompt = buildTaxonomyPrompt({ title: "The Debt Machine", language: "en", manuscriptExcerpt: "Credit creates deposits." });
  assert.match(prompt, /real current pair/);
  assert.match(prompt, /exactly seven buyer-search phrases/);
  assert.match(prompt, /remain unapproved until a human decision/);
  assert.match(prompt, /Credit creates deposits/);
});
