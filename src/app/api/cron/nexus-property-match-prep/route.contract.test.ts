import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/cron/nexus-property-match-prep/route.ts", "utf8");

test("property matching keeps approved Buyer Profile as hard gate", () => {
  assert.match(source, /buyerProfileStatus !== "APPROVED"/);
  assert.match(source, /prepareInboundPropertyMatches/);
});

test("customer taste is derived from CRM feedback and used only for ranking", () => {
  assert.match(source, /buildCustomerTasteProfile/);
  assert.match(source, /\.from\("contacts"\)/);
  assert.match(source, /\.select\("interactions"\)/);
  assert.match(source, /tasteProfile: customerTaste/);
  assert.match(source, /customer_taste_ranking_applied/);
  assert.match(source, /sekundær rangering/);
});

test("Delta Matching compares against approved shortlist history across Buyer Profile versions", () => {
  assert.match(source, /selectPropertyDeltaCandidates/);
  assert.match(source, /\.from\("buyer_profiles"\)/);
  assert.match(source, /\.from\("lead_property_shortlists"\)/);
  assert.match(source, /\.eq\("status", "approved"\)/);
  assert.match(source, /\.from\("lead_property_shortlist_items"\)/);
  assert.match(source, /property_match_raw_count/);
  assert.match(source, /property_match_repeat_suppressed/);
});

test("unchanged reviewed homes do not become a fresh shortlist or false no-match follow-up", () => {
  assert.match(source, /NO_MEANINGFUL_DELTA/);
  assert.match(source, /property_match_count: deltaProperties\.length/);
  assert.match(source, /no_match_followup_required: false/);
  assert.match(source, /Ingen ny shortlist eller kundekontakt er nødvendig/);
});

test("taste and delta layers do not mutate buyer profiles or send customer communication", () => {
  assert.doesNotMatch(source, /from\("buyer_profiles"\)\.update/);
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /sendEmail\(/);
  assert.doesNotMatch(source, /smtp/i);
});
