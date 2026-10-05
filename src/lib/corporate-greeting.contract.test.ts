import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { corporateOutreachTemplates, personalizeCorporateOutreach } from "./corporate-outreach";

const coach = fs.readFileSync("src/lib/nexus/corporate-sales-coach.ts", "utf8");

test("Corporate outreach uses natural Norwegian greeting without a known first name", () => {
  const message = personalizeCorporateOutreach(corporateOutreachTemplates[0], {
    firstName: null,
    companyName: "Eksempel AS",
  });
  assert.match(message.body, /^Hei,\n/);
  assert.doesNotMatch(message.body, /Hei der/i);
});

test("Corporate outreach uses first name when it is known", () => {
  const message = personalizeCorporateOutreach(corporateOutreachTemplates[0], {
    firstName: "Kari",
    companyName: "Eksempel AS",
  });
  assert.match(message.body, /^Hei Kari,\n/);
});

test("Nexus Sales Coach explicitly blocks the unnatural Hei der greeting", () => {
  assert.match(coach, /normalizeNorwegianEmailGreeting/);
  assert.match(coach, /Bruk aldri "Hei der"/);
  assert.match(coach, /replace\(\/\^Hei\\s\+der/);
});
