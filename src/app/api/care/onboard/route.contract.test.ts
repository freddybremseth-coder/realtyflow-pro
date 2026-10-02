import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/care/onboard/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261002220500_care_lead_onboarding.sql", "utf8");
const dashboard = readFileSync("src/components/care/care-dashboard.tsx", "utf8");

test("Care onboarding is an explicit admin-only action", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /supabase\.rpc\("care_onboard_lead"/);
  assert.match(route, /const planId = clean\(body\.planId/);
  assert.match(route, /p_plan_id: planId \|\| null/);
  assert.doesNotMatch(route, /sendBrandEmail|sendEmail|createInvoice|sendMessage/);
});

test("Care onboarding validates the property and billing inputs before mutation", () => {
  assert.match(route, /PROPERTY_TYPES = new Set\(\["apartment", "townhouse", "villa", "finca"\]\)/);
  assert.match(route, /Adresse og kommune er påkrevd/);
  assert.match(route, /billingDay < 1 \|\| billingDay > 28/);
  assert.match(route, /validDate\(startsOn\)/);
});

test("Care onboarding database mutation is service-role only and tied to a real Care lead", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /source_type = 'website_lead'/);
  assert.match(migration, /brand_id = 'zeneco'/);
  assert.match(migration, /metadata->>'segment'.*= 'care'/s);
  assert.match(migration, /revoke all on function public\.care_onboard_lead[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.care_onboard_lead[\s\S]*to service_role/i);
});

test("Care onboarding reuses the property linked to the lead and does not create duplicate active contracts", () => {
  assert.match(migration, /metadata->>'care_property_id'/);
  assert.match(migration, /id = \(v_work_item\.metadata->>'care_property_id'\)::uuid/);
  assert.match(migration, /where org_id = v_org_id[\s\S]*owner_id = p_contact_id[\s\S]*lower\(btrim\(address_line\)\)/i);
  assert.match(migration, /status in \('active', 'renewal_due'\)/);
  assert.match(migration, /active Care contract already exists with a different plan/i);
  assert.match(migration, /care_property_id/);
  assert.match(migration, /care_contract_id/);
});

test("Care onboarding UI makes plan activation optional and explicit", () => {
  assert.match(dashboard, /Opprett Care-kunde/);
  assert.match(dashboard, /Ingen plan ennå/);
  assert.match(dashboard, /ingen aktiv avtale eller fakturering/i);
  assert.match(dashboard, /fetch\("\/api\/care\/onboard"/);
  assert.match(dashboard, /Ingen e-post eller faktura sendes/);
  assert.match(dashboard, /Aktiver avtale/);
  assert.match(dashboard, /activatingAgreement && !planId/);
  assert.match(dashboard, /lead\.carePropertyAddress/);
});
