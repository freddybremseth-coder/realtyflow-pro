import assert from "node:assert/strict";
import test from "node:test";

import { creativeStyleInstruction, selectPropertyCreativeStyle } from "./creative-style";

test("uses an eligible learned winner when supplied", () => {
  assert.equal(selectPropertyCreativeStyle({
    channel: "facebook",
    seed: "N9950",
    favoredStyle: "fact_card",
  }), "fact_card");
});

test("rotates away from recently used concepts when learning has no winner", () => {
  const selected = selectPropertyCreativeStyle({
    channel: "facebook",
    seed: "N9950-2026-09-25",
    recentStyles: ["hero_property", "fact_card", "lifestyle", "question_hook", "advisor", "minimal_premium"],
  });
  assert.equal(selected, "carousel");
});

test("creative concepts expose prompt guidance", () => {
  assert.match(creativeStyleInstruction("minimal_premium") ?? "", /very little copy/i);
  assert.equal(creativeStyleInstruction("unknown"), null);
});
