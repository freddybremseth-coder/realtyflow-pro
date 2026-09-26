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
