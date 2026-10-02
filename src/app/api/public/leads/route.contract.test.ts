import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/public/leads/route.ts", "utf8");

test("public lead preserves deterministic acquisition identity through CRM and revenue event", () => {
  for (const field of [
    "submission_id", "publication_id", "visitor_id", "session_id",
    "utm_source", "utm_medium", "utm_campaign", "utm_content",
  ]) assert.match(source, new RegExp(field));
  assert.match(source, /insertRevenueEvent/);
  assert.match(source, /sourceSystem: "public_leads"/);
});

test("submission id makes CRM interaction and revenue event idempotent", () => {
  assert.match(source, /submissionId \? `website-\$\{submissionId\}`/);
  assert.match(source, /const revenueSourceId = submissionId \|\| propertyRef \|\| pageUrl \|\| String\(incomingInteraction\.id\)/);
  assert.match(source, /buildRevenueEventDedupeKey\(\["public_leads", brandId, revenueSourceId\]\)/);
});


test("Corporate Homes inbound fields stay structured without colliding with the company honeypot", () => {
  assert.match(source, /body\.organization_name \|\| body\.organizationName/);
  assert.match(source, /body\.organization_type \|\| body\.organizationType/);
  assert.match(source, /body\.contact_role \|\| body\.contactRole/);
  assert.match(source, /body\.user_count \|\| body\.userCount/);
  assert.match(source, /body\.corporate_model \|\| body\.corporateModel/);
  assert.match(source, /body\.website \|\| body\.company \|\| body\.url/);
  assert.doesNotMatch(source, /const organizationName = cleanText\(body\.company/);
});

test("Corporate Homes inbound requests create or update the company prospect and assessment", () => {
  assert.match(source, /normalizeCorporateProspect/);
  assert.match(source, /rescoreCorporateProspect/);
  assert.match(source, /\.from\("corporate_prospects"\)/);
  assert.match(source, /status: "ENGAGED"/);
  assert.match(source, /corporate_assessment/);
  assert.match(source, /budget_min_eur/);
  assert.match(source, /budget_max_eur/);
  assert.match(source, /expected_users/);
  assert.match(source, /converted_contact_id: data\.id/);
  assert.match(source, /corporate_prospect_id: corporateProspect\?\.id/);
});

test("Corporate inbound integration does not enrich people or send outreach", () => {
  assert.doesNotMatch(source, /corporate_prospect_contacts/);
  assert.doesNotMatch(source, /sendEmail|sendMessage|personal_contact_enrichment/);
});


test("Corporate partner inbound is separated from Corporate Home buyer prospects", () => {
  assert.match(source, /const isCorporatePartner/);
  assert.match(source, /const isCorporateHome = brandId === "zeneco" && !isCare && !isCorporatePartner/);
  assert.match(source, /requestType === "corporate-partner"/);
  assert.match(source, /\.from\("corporate_partner_prospects"\)/);
  assert.match(source, /corporate_partner_id: corporatePartner\?\.id/);
  assert.match(source, /voluntary_contact_submission: true/);
  assert.match(source, /personal_enrichment_performed: false/);
});

test("Direct partner inquiries become engaged without automated outreach", () => {
  assert.match(source, /Direkte partnerhenvendelse fra ZenEcoHomes\.com/);
  assert.match(source, /converted_contact_id: data\.id/);
  assert.match(source, /Corporate Homes partner: svar personlig/);
  assert.doesNotMatch(source, /sendEmail|sendMessage|personal_contact_enrichment/);
});

test("public lead recovers UTM attribution from page_url when fields are not posted separately", () => {
  assert.match(source, /trackingFromPageUrl\(pageUrl\)/);
  assert.match(source, /pageTracking\.utm_source/);
  assert.match(source, /pageTracking\.utm_campaign/);
  assert.match(source, /pageTracking\.utm_content/);
  assert.match(source, /pageTracking\.visitor_id/);
  assert.match(source, /pageTracking\.session_id/);
});


test("Care leads remain a distinct Zen Eco Homes service segment", () => {
  assert.match(source, /const careRequestTypes = new Set/);
  assert.match(source, /"care-boligtilsyn"/);
  assert.match(source, /"care-nokkeloppbevaring"/);
  assert.match(source, /"care-klargjoring"/);
  assert.match(source, /"care-uvaer"/);
  assert.match(source, /const isCare = brandId === "zeneco"/);
  assert.match(source, /segment: isCare \? "care"/);
  assert.match(source, /service_intent: isCare \? careServiceIntent/);
  assert.match(source, /source: source \|\| null/);
  assert.match(source, /preferred_area: preferredArea \|\| null/);
  assert.match(source, /property_type: propertyType \|\| null/);
  assert.match(source, /Zen Eco Homes Care: svar personlig/);
  assert.match(source, /const canOfferPortal = !isCare/);
});
