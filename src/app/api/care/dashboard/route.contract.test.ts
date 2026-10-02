import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/care/dashboard/route.ts", "utf8");
const dashboard = readFileSync("src/components/care/care-dashboard.tsx", "utf8");

test("Care dashboard loads only Zen Eco Homes website leads and identifies the Care segment", () => {
  assert.match(route, /\.from\("work_items"\)/);
  assert.match(route, /\.eq\("brand_id", "zeneco"\)/);
  assert.match(route, /\.eq\("source_type", "website_lead"\)/);
  assert.match(route, /segment === "care"/);
  assert.match(route, /requestType\.startsWith\("care-"\)/);
  assert.match(route, /nextAction\.includes\("zen eco homes care"\)/);
});

test("Care lead context joins CRM contacts and passes them to the dashboard model", () => {
  assert.match(route, /\.from\("contacts"\)/);
  assert.match(route, /pipeline_status,source,brand_id/);
  assert.match(route, /careLeadWorkItems: careLeadContext\.workItems/);
  assert.match(route, /careLeadContacts: careLeadContext\.contacts/);
});

test("Care overview surfaces source page, service intent and direct customer card navigation", () => {
  assert.match(dashboard, /Nye Care-henvendelser/);
  assert.match(dashboard, /careServiceLabel\(lead\.serviceIntent\)/);
  assert.match(dashboard, /sourcePageLabel\(lead\.pageUrl\)/);
  assert.match(dashboard, /lead\.source \|\| "Care webskjema"/);
  assert.match(dashboard, /href=\{lead\.customerHref\}/);
  assert.match(dashboard, /Åpne kundekort/);
});
