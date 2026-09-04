import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const service = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/today-service.ts"), "utf8");

test("TODAY keeps primary attention score-based", () => {
  assert.match(service, /candidates\.sort\(\(a, b\) => score\(b, now\) - score\(a, now\)\)/);
  assert.match(service, /const oneThing = candidates\[0\]/);
});

test("highest-ranked remaining item is always preserved as first secondary", () => {
  assert.match(service, /const selected: TodayItem\[\] = \[remaining\[0\]\]/);
  assert.match(service, /domain diversity never hides urgency/i);
});

test("second secondary diversifies domain when another domain exists", () => {
  assert.match(service, /const diverse = remaining\.slice\(1\)\.find/);
  assert.match(service, /selected\.push\(diverse \|\| remaining\[1\]\)/);
  assert.match(service, /second_secondary_diversifies_domain_when_available/);
});

test("TODAY domains are explicit for personal business publishing and learning", () => {
  for (const domain of ["personal", "business", "publishing", "learning"]) assert.match(service, new RegExp(`domain: "${domain}"`));
});

test("attention balance does not alter memory or execution safety", () => {
  assert.match(service, /persistAsPersonalMemory: false/);
  assert.doesNotMatch(service, /auto.?execute|outboundActions: true|personality_score/i);
});
