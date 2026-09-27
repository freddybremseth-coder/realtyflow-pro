import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Corporate overview funnel uses canonical Revenue OS outcomes instead of inferred CRM outcomes", () => {
  const route = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
  const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

  assert.match(route, /\.from\("revenue_events"\)/);
  assert.match(route, /\.eq\("source_system", "corporate_homes"\)/);
  assert.match(route, /"viewing_completed", "offer_made"/);
  assert.match(route, /documentedOnly: true/);
  assert.match(route, /viewingContactIds\.size/);
  assert.match(route, /offerContactIds\.size/);

  assert.match(page, /Marketing → Revenue/);
  assert.match(page, /Faktisk visning/);
  assert.match(page, /Faktisk tilbud/);
  assert.match(page, /CRM-status alene brukes ikke som bevis/);
  assert.match(page, /Tallene er observasjoner, ikke prognoser/);
});
