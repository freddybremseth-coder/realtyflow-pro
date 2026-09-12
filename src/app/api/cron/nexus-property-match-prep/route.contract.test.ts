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

test("taste layer does not mutate buyer profiles or send customer communication", () => {
  assert.doesNotMatch(source, /from\("buyer_profiles"\)\.update/);
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /sendEmail\(/);
  assert.doesNotMatch(source, /smtp/i);
});
