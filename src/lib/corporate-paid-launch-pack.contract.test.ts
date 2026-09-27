import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const growth = fs.readFileSync("src/lib/corporate-homes-growth.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

test("Corporate paid launch pack has separate tracked channels and no automatic spend", () => {
  assert.match(growth, /source: "google"/);
  assert.match(growth, /medium: "cpc"/);
  assert.match(growth, /source: "linkedin"/);
  assert.match(growth, /source: "meta"/);
  assert.match(growth, /utm_content/);
  assert.match(growth, /automaticSpendAllowed: false/);
  assert.match(growth, /automaticPublishingAllowed: false/);
  assert.match(growth, /READY_FOR_MANUAL_LAUNCH/);
});

test("Corporate dashboard exposes Google, LinkedIn and Meta launch pack", () => {
  assert.match(page, /Google Search · klargjort/);
  assert.match(page, /LinkedIn · klargjort/);
  assert.match(page, /Meta · klargjort/);
  assert.match(page, /Paid launch pack/);
  assert.match(page, /Ingen automatisk spend/);
  assert.match(page, /Test sporingslenke/);
});
