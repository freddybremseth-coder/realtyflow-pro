import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/reflect/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/layout.tsx"), "utf8");

test("Reflection Mode is directly reachable from Personal Intelligence navigation", () => {
  assert.match(layout, /href="\/personal-intelligence\/reflect"/);
  assert.match(layout, />Reflect</);
  assert.match(layout, /href="\/personal-intelligence"/);
});

test("Reflection accepts editable text or dictation and never auto-submits dictation", () => {
  assert.match(page, /<DictationButton/);
  assert.match(page, /onTranscript=\{appendTranscript\}/);
  assert.match(page, /value=\{reflection\}/);
  assert.match(page, /\/api\/personal-intelligence\/reflect/);
});

test("Reflection UI tells the user what is and is not retained", () => {
  assert.match(page, /Rå refleksjon og mentorsvar lagres ikke/);
  assert.match(page, /Denne refleksjonen og mentorsvaret ble ikke skrevet til mentor\.messages/);
  assert.match(page, /ingenting lagres som personlig memory før du aktivt velger det/);
});

test("Reflection memory candidates remain explicit choices", () => {
  assert.match(page, /\/api\/personal-intelligence\/memory\/confirm/);
  assert.match(page, /> Husk</);
  assert.match(page, /> Privat</);
  assert.match(page, /> Dropp</);
});

test("Reflection Alpha scope remains internal/private only", () => {
  assert.match(page, /useState<"internal" \| "private">\("private"\)/);
  assert.doesNotMatch(page, /setPrivacyScope\("sensitive"\)/);
  assert.doesNotMatch(page, /setPrivacyScope\("restricted"\)/);
});
