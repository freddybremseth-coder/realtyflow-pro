import assert from "node:assert/strict";
import test from "node:test";
import { parsePropertyEditorialAiResponseWithFallbackIntro } from "./property-editorial-ai-diagnostics";

test("repairs only a missing intro with deterministic factual fallback text", () => {
  const parsed = parsePropertyEditorialAiResponseWithFallbackIntro(
    JSON.stringify({
      headline_no: "Villa med 3 soverom i La Romana",
      bullets_no: ["Privat basseng", "Parkering"],
      orientation_no: "Ikke angitt",
      location: "La Romana",
      price: 349000,
    }),
    "Villa med 3 soverom og 2 bad i La Romana. Oppgitt areal 125 m².",
  );

  assert.deepEqual(parsed, {
    headline_no: "Villa med 3 soverom i La Romana",
    intro_no: "Villa med 3 soverom og 2 bad i La Romana. Oppgitt areal 125 m².",
    bullets_no: ["Privat basseng", "Parkering"],
    orientation_no: "Ikke angitt",
  });
});

test("keeps a valid AI intro instead of replacing it", () => {
  const parsed = parsePropertyEditorialAiResponseWithFallbackIntro(
    JSON.stringify({
      headline_no: "Villa med 3 soverom i La Romana",
      intro_no: "Villa med 3 soverom og 2 bad i La Romana.",
      bullets_no: [],
      orientation_no: "Ikke angitt",
    }),
    "Fallback intro som ikke skal brukes.",
  );

  assert.equal(parsed?.intro_no, "Villa med 3 soverom og 2 bad i La Romana.");
});

test("does not repair output missing the required headline", () => {
  assert.equal(
    parsePropertyEditorialAiResponseWithFallbackIntro(
      JSON.stringify({ bullets_no: [], orientation_no: "Ikke angitt" }),
      "Faktabasert fallback intro.",
    ),
    null,
  );
});
