import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const api = fs.readFileSync("src/app/api/corporate-homes/partners/[id]/brief/route.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/partners/[id]/page.tsx", "utf8");
const list = fs.readFileSync("src/app/(business)/corporate-homes/partners/page.tsx", "utf8");

test("Partner dossier API reads only partner-company data", () => {
  assert.match(api, /corporate_partner_prospects/);
  assert.match(api, /buildCorporatePartnerBrief/);
  assert.doesNotMatch(api, /corporate_prospect_contacts/);
  assert.doesNotMatch(api, /contacts/);
});

test("Partner dossier UI is draft-first with no send action", () => {
  assert.match(page, /Norsk partnersekvens/);
  assert.match(page, /Kopier utkast/);
  assert.match(page, /Dag 0 · 7 · 21/);
  assert.match(page, /ingen automatisk utsendelse/i);
  assert.doesNotMatch(page, /sendEmail|sendMessage|email\/send/);
});

test("Partner queue links each company to its dossier", () => {
  assert.match(list, /Åpne dossier/);
  assert.match(list, /\/corporate-homes\/partners\//);
});
