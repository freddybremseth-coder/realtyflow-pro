import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const route = readFileSync("src/app/api/care/leads/[id]/route.ts", "utf8");

test("Care lead follow-up route is admin-only and scoped to Zen Eco Homes Care", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /brand_id === "zeneco"/);
  assert.match(route, /source_type === "website_lead"/);
  assert.match(route, /requestType\.startsWith\("care-"\)/);
  assert.match(route, /\.eq\("brand_id", "zeneco"\)/);
  assert.match(route, /\.eq\("source_type", "website_lead"\)/);
});

test("Care lead follow-up requires dates for active quote follow-up stages", () => {
  assert.match(route, /FOLLOW_UP_STAGES/);
  assert.match(route, /quote_sent/);
  assert.match(route, /waiting_customer/);
  assert.match(route, /Sett oppfølgingsdato/);
  assert.match(route, /care_follow_up_on/);
  assert.match(route, /care_quote_sent_at/);
});

test("Care lead follow-up cannot override an activated contract", () => {
  assert.match(route, /care_contract_id/);
  assert.match(route, /allerede aktivert/);
  assert.match(route, /status = stage === "not_relevant" \? "CANCELLED"/);
});


test("Care quote follow-up stores a validated plan snapshot", () => {
  assert.match(route, /quotePlanId/);
  assert.match(route, /supabase\.schema\("care"\)/);
  assert.match(route, /\.from\("kh_plans"\)/);
  assert.match(route, /care_quote_plan_id/);
  assert.match(route, /care_quote_plan_name/);
  assert.match(route, /care_quote_price_cents/);
  assert.match(route, /care_quote_currency/);
  assert.match(route, /Velg Care-planen tilbudet gjelder/);
});
