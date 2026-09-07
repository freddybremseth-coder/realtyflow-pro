import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePropertyEditorialAiOutput,
  sanitizePropertyEditorialText,
} from "./property-editorial-ai-diagnostics";

// Regression coverage for production fallback_reason=invalid_output on N3849.
test("sanitizer removes promotional wording without inventing replacement claims", () => {
  assert.equal(
    sanitizePropertyEditorialText("Fantastisk villa med unik beliggenhet og perfekt terrasse."),
    "villa med beliggenhet og terrasse.",
  );
  assert.equal(
    sanitizePropertyEditorialText("Eksklusive og spektakulære omgivelser"),
    "og omgivelser",
  );
});

test("parser accepts valid fenced JSON and sanitizes promotional copy", () => {
  const parsed = parsePropertyEditorialAiOutput(`\`\`\`json
{
  "headline_no": "Fantastisk villa med 3 soverom i Finestrat",
  "intro_no": "Unik villa med 3 soverom og 2 bad. Perfekt som feriebolig.",
  "bullets_no": ["Eksklusiv terrasse", "Fellesbasseng", "Fellesbasseng"],
  "orientation_no": "Feriebolig"
}
\`\`\``);

  assert.ok(parsed);
  assert.equal(parsed.headline_no, "villa med 3 soverom i Finestrat");
  assert.equal(parsed.intro_no, "villa med 3 soverom og 2 bad. som feriebolig.");
  assert.deepEqual(parsed.bullets_no, ["terrasse", "Fellesbasseng"]);
  assert.equal(parsed.orientation_no, "Feriebolig");
  assert.doesNotMatch(JSON.stringify(parsed), /fantastisk|unik|perfekt|eksklusiv|spektakulær/i);
});

test("parser rejects structurally incomplete or promotional-only required fields", () => {
  assert.equal(
    parsePropertyEditorialAiOutput(JSON.stringify({
      headline_no: "Fantastisk",
      intro_no: "Perfekt",
      bullets_no: [],
      orientation_no: "Feriebolig",
    })),
    null,
  );

  assert.equal(
    parsePropertyEditorialAiOutput(JSON.stringify({
      headline_no: "Villa i Finestrat",
      bullets_no: [],
      orientation_no: "Feriebolig",
    })),
    null,
  );
});
