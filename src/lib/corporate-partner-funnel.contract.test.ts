import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const draftsRoute = fs.readFileSync("src/app/api/corporate-homes/partners/[id]/outreach-drafts/route.ts", "utf8");
const partnerPage = fs.readFileSync("src/app/(business)/corporate-homes/partners/page.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260927112500_corporate_partner_inbound_contact_link.sql", "utf8");

test("Partner outreach endpoint is read-only draft generation", () => {
  assert.match(draftsRoute, /export async function GET/);
  assert.doesNotMatch(draftsRoute, /export async function POST/);
  assert.match(draftsRoute, /sendAllowed: false/);
  assert.doesNotMatch(draftsRoute, /sendEmail|sendMessage|publish/);
});

test("Partner queue presents drafts as manual copy-only content", () => {
  assert.match(partnerPage, /Vis e-postutkast/);
  assert.match(partnerPage, /Kun utkast · ingen automatisk utsendelse/);
  assert.match(partnerPage, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(partnerPage, /Send e-post|Send nå/);
});

test("Voluntary partner inquiry can link to the CRM contact", () => {
  assert.match(migration, /converted_contact_id uuid references public\.contacts\(id\)/);
});
