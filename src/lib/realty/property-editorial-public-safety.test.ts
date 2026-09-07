import assert from "node:assert/strict";
import test from "node:test";

import { isPropertyEditorialPublicCopySafe } from "./property-editorial-ai-diagnostics";

const clean = {
  headline_no: "Leilighet med 1 soverom og 1 bad",
  intro_no: "Leilighet i Relleu med 1 soverom og 1 bad.",
  bullets_no: ["Fjellutsikt"],
  orientation_no: "Ikke angitt",
};

test("accepts factual public copy while allowing orientation placeholder internally", () => {
  assert.equal(isPropertyEditorialPublicCopySafe(clean), true);
});

test("rejects missing-fact placeholders in public editorial fields", () => {
  assert.equal(
    isPropertyEditorialPublicCopySafe({
      ...clean,
      intro_no: "Leilighet i Relleu. Areal er ikke angitt.",
    }),
    false,
  );
});

test("rejects promotional language that should use deterministic fallback", () => {
  assert.equal(
    isPropertyEditorialPublicCopySafe({
      ...clean,
      bullets_no: ["Fredelig boligområde"],
    }),
    false,
  );
});
