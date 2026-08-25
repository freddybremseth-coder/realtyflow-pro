import assert from "node:assert/strict";
import test from "node:test";
import { planCreativeMutations, variantCta, variantPrompt } from "./creative-variants";

test("variant planner caps at 20 and rotates mutation axes", () => {
  const rows = planCreativeMutations(25);
  assert.equal(rows.length, 20);
  assert.equal(rows[0].axis, "composition");
  assert.equal(rows[1].axis, "context");
  assert.equal(rows[5].axis, "composition");
});

test("variant prompt preserves parent prompt and appends controlled mutation", () => {
  const prompt = variantPrompt("Parent prompt", "Change crop");
  assert.match(prompt, /Parent prompt/);
  assert.match(prompt, /CONTROLLED WINNER VARIANT/);
  assert.match(prompt, /Change crop/);
});

test("CTA variants are deterministic", () => {
  assert.equal(variantCta("Book nå", 1), "Book nå");
  assert.equal(variantCta("Book nå", 2), "Se mer");
});
