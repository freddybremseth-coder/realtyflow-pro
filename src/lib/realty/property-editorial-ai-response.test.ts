import assert from "node:assert/strict";
import test from "node:test";
import { parsePropertyEditorialAiResponse } from "./property-editorial-no";

const valid = {
  headline_no: "Villa med 3 soverom i La Romana",
  intro_no: "Villa med 3 soverom og 2 bad i La Romana.",
  bullets_no: ["Privat basseng", "Parkering"],
  orientation_no: "Ikke angitt",
};

test("accepts plain structured JSON", () => {
  assert.deepEqual(parsePropertyEditorialAiResponse(JSON.stringify(valid)), valid);
});

test("accepts JSON wrapped in a markdown code fence", () => {
  const wrapped = `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
  assert.deepEqual(parsePropertyEditorialAiResponse(wrapped), valid);
});

test("accepts provider text around one JSON object", () => {
  const wrapped = `Resultat:\n${JSON.stringify(valid)}\n`;
  assert.deepEqual(parsePropertyEditorialAiResponse(wrapped), valid);
});

test("neutralizes promotional words instead of discarding an otherwise usable response", () => {
  const parsed = parsePropertyEditorialAiResponse(
    JSON.stringify({
      ...valid,
      headline_no: "Fantastisk villa med 3 soverom i La Romana",
      intro_no: "En unik og eksklusiv villa med 3 soverom og 2 bad.",
      bullets_no: ["Perfekt beliggenhet", "Parkering"],
    }),
  );
  assert.ok(parsed);
  assert.doesNotMatch(
    `${parsed.headline_no} ${parsed.intro_no} ${parsed.bullets_no.join(" ")}`,
    /drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt/i,
  );
});

test("normalizes missing optional list/use fields safely", () => {
  assert.deepEqual(
    parsePropertyEditorialAiResponse(
      JSON.stringify({
        headline_no: valid.headline_no,
        intro_no: valid.intro_no,
      }),
    ),
    {
      headline_no: valid.headline_no,
      intro_no: valid.intro_no,
      bullets_no: [],
      orientation_no: "Ikke angitt",
    },
  );
});

test("still rejects output without the two required text fields", () => {
  assert.equal(parsePropertyEditorialAiResponse(JSON.stringify({ headline_no: "Villa" })), null);
});
