import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

test("Corporate Homes overview includes prospect and discovery command-center data", () => {
  assert.match(route, /corporate_prospects/);
  assert.match(route, /corporate_homes_discovery/);
  assert.match(route, /nexus_runtime_controls/);
  assert.match(route, /progressPercent/);
  assert.match(route, /promotedProspects/);
  assert.match(route, /focusProspects/);
  assert.match(route, /evaluateCorporateProspectReadiness/);
});

test("Corporate Homes dashboard surfaces prospect progress and CRM promotion state", () => {
  assert.match(page, /norske selskapsprospekter/);
  assert.match(page, /A-fit/);
  assert.match(page, /B-fit/);
  assert.match(page, /Promotert til CRM/);
  assert.match(page, /Siste discovery/);
  assert.match(page, /Fokus nå/);
  assert.match(page, /Klarhet/);
});


test("Corporate Homes overview attributes actual leads by acquisition channel", () => {
  assert.match(route, /acquisitionIdentity/);
  assert.match(route, /acquisitionChannel/);
  assert.match(route, /utm_source/);
  assert.match(route, /utm_medium/);
  assert.match(route, /utm_campaign/);
  assert.match(route, /leadToQualifiedRate/);
  assert.match(route, /pipelineValue/);
  assert.match(route, /Google/);
  assert.match(route, /LinkedIn/);
  assert.match(route, /Meta/);
  assert.match(route, /Outbound/);
  assert.match(route, /Organisk \/ direkte/);
});

test("Corporate Homes dashboard surfaces channel performance before paid scaling", () => {
  assert.match(page, /Kanalresultater/);
  assert.match(page, /Lead → kval\./);
  assert.match(page, /Aktiv pipeline/);
  assert.match(page, /før annonsebudsjett skaleres/);
});
