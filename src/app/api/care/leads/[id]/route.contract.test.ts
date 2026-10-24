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

test("Care offer fields require explicit package, weather choice and date for acceptance", () => {
  assert.match(route, /care_offer_reference/);
  assert.match(route, /care_offer_package/);
  assert.match(route, /care_offer_weather/);
  assert.match(route, /care_offer_acceptance_status/);
  assert.match(route, /offerAcceptance === "accepted"/);
  assert.match(route, /Registrer valgt pakke/);
});

test("Care offer PDFs use private storage and require admin authorization", () => {
  const pdfRoute = readFileSync("src/app/api/care/leads/[id]/offer/route.ts", "utf8");
  assert.match(pdfRoute, /requireAdminApi\(request\)/);
  assert.match(pdfRoute, /property-documents/);
  assert.match(pdfRoute, /care-offers/);
  assert.match(pdfRoute, /createSignedUrl\(path, 60\)/);
  assert.match(pdfRoute, /MAX_BYTES/);
  assert.match(pdfRoute, /%PDF-/);
});
