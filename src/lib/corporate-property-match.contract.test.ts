import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/property-match/route.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/prospects/[id]/page.tsx", "utf8");

test("Corporate Property Match persists only top five on explicit POST", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /result\.properties\.slice\(0, 5\)/);
  assert.match(route, /corporate_property_match/);
  assert.match(route, /customer_shared: false/);
  assert.match(route, /human_quality_check_required: true/);
  assert.doesNotMatch(route, /sendEmail|sendMessage|publish/);
});

test("Corporate Property Match preview GET stays non-persistent", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /persisted: false/);
});

test("Corporate dossier uses explicit persist action and shows classification", () => {
  assert.match(page, /method: "POST"/);
  assert.match(page, /Lag og lagre boligshortlist/);
  assert.match(page, /corporate_use_classification/);
  assert.match(page, /Åpne bolig/);
});
