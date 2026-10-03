import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/care/quotes/route.ts", "utf8");

test("Care quotes are admin-only and tied to a real Zen Eco Homes Care lead", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /\.eq\("brand_id", "zeneco"\)/);
  assert.match(route, /\.eq\("source_type", "website_lead"\)/);
  assert.match(route, /requestType\.startsWith\("care-"\)/);
  assert.match(route, /metadata\.segment/);
});

test("Care quote creation snapshots the selected active plan without sending email", () => {
  assert.match(route, /\.schema\("care"\)[\s\S]*\.from\("kh_plans"\)/);
  assert.match(route, /\.eq\("is_active", true\)/);
  assert.match(route, /plan_snapshot:/);
  assert.match(route, /monthly_price_cents: monthlyPriceCents/);
  assert.doesNotMatch(route, /sendBrandEmail|sendEmail|nodemailer|Resend/);
});

test("Care quote state transitions are explicit and update the work item next action", () => {
  assert.match(route, /"mark_sent"/);
  assert.match(route, /"accept"/);
  assert.match(route, /"decline"/);
  assert.match(route, /status: "sent"/);
  assert.match(route, /status: "accepted"/);
  assert.match(route, /status: "declined"/);
  assert.match(route, /care_quote_status/);
  assert.match(route, /Care-tilbud er sendt/);
  assert.match(route, /Care-tilbud er akseptert/);
});
