import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/public/leads/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260927112500_corporate_partner_inbound_contact_link.sql", "utf8");

test("Voluntary partner inquiry can link partner company to CRM contact", () => {
  assert.match(migration, /converted_contact_id uuid references public\.contacts\(id\)/);
  assert.match(route, /converted_contact_id: data\.id/);
  assert.match(route, /voluntary_contact_submission: true/);
});

test("Partner inbound remains human-follow-up only", () => {
  assert.match(route, /Corporate Homes partner: svar personlig/);
  assert.match(route, /personal_enrichment_performed: false/);
  assert.doesNotMatch(route, /\bsendEmail\s*\(|\bsendMessage\s*\(|\bpublish\s*\(/);
});
