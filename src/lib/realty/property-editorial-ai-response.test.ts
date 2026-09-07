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

test("still rejects promotional claims", () => {
  assert.equal(
    parsePropertyEditorialAiResponse(
      JSON.stringify({ ...valid, intro_no: "Fantastisk villa med 3 soverom." }),
    ),
    null,
  );
});

test("rejects incomplete output", () => {
  assert.equal(parsePropertyEditorialAiResponse(JSON.stringify({ headline_no: "Villa" })), null);
});
