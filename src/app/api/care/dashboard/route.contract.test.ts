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


test("Care overview exposes an operational funnel and daily attention board", () => {
  assert.match(dashboard, /Dette bør du gjøre i dag/);
  assert.match(dashboard, /Henvendelse → Care-kunde → avtale → besøk → MRR/);
  assert.match(dashboard, /dashboard\.lifecycle\.awaitingProperty/);
  assert.match(dashboard, /dashboard\.lifecycle\.awaitingContract/);
  assert.match(dashboard, /dashboard\.lifecycle\.propertiesWithoutNextVisit/);
  assert.match(dashboard, /dashboard\.lifecycle\.propertiesWithoutKey/);
  assert.match(dashboard, /dashboard\.summary\.monthlyRecurringRevenueCents/);
  assert.match(dashboard, /id="care-leads"/);
});

test("Care source page is only linked when it belongs to the Care subdomain", () => {
  assert.match(dashboard, /url\.hostname === "care\.zenecohomes\.com"/);
  assert.match(dashboard, /target="_blank"/);
  assert.match(dashboard, /ExternalLink/);
});


test("Care customer cards expose CRM and operational follow-up links", () => {
  assert.match(dashboard, /Åpne kundekort/);
  assert.match(dashboard, /property\.ownerId/);
  assert.match(dashboard, /Ingen aktiv Care-avtale/);
  assert.match(dashboard, /Aktiv avtale uten planlagt neste besøk/);
  assert.match(dashboard, /Ingen registrert nøkkel/);
  assert.match(dashboard, /Nøkler & kalender/);
  assert.match(dashboard, /Faktura & MRR/);
});
