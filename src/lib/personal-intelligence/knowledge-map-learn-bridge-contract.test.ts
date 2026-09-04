import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const mapPage = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/map/page.tsx"), "utf8");
const learnPage = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/learn/page.tsx"), "utf8");

test("Knowledge Map exposes an explicit Learn this bridge with topic id", () => {
  assert.match(mapPage, /Learn this/);
  assert.match(mapPage, /\/personal-intelligence\/learn\?topic=/);
  assert.match(mapPage, /encodeURIComponent\(topic\.id\)/);
});

test("LEARN preselects requested mapped topic without auto-starting Professor", () => {
  assert.match(learnPage, /new URLSearchParams\(window\.location\.search\)\.get\("topic"\)/);
  assert.match(learnPage, /setSelectedTopic\(requestedTopic\)/);
  assert.doesNotMatch(learnPage, /requestedTopic[\s\S]{0,120}startTopic\(requestedTopic\)/);
  assert.match(learnPage, /Start Professor/);
});

test("Professor start remains an explicit owner UI action", () => {
  assert.match(learnPage, /onClick=\{\(\) => void startTopic\(selectedTopic\)\}/);
  assert.match(learnPage, /\/api\/personal-intelligence\/learning\/session/);
});

test("bridge does not create or promote mastery directly", () => {
  assert.doesNotMatch(mapPage, /from\("mastery"\)|mastery.*insert|mastery.*update/i);
  assert.doesNotMatch(learnPage, /from\("mastery"\)|mastery.*insert|mastery.*update/i);
  assert.match(learnPage, /does not automatically declare the topic mastered/i);
});
