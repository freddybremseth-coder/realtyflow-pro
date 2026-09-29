import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const publicLeads = fs.readFileSync("src/app/api/public/leads/route.ts", "utf8");
const growthRoute = fs.readFileSync("src/app/api/workspaces/[brandKey]/growth/route.ts", "utf8");
const growthPanel = fs.readFileSync("src/components/workspaces/growth-corporate-panel.tsx", "utf8");

test("Corporate referral partner id is validated and preserved through CRM + revenue metadata", () => {
  assert.match(publicLeads, /referral_partner_id/);
  assert.match(publicLeads, /referredByPartner/);
  assert.match(publicLeads, /\.from\("corporate_partner_prospects"\)/);
  assert.match(publicLeads, /referral_partner_name/);
  assert.match(publicLeads, /corporate_assessment/);
});

test("workspace growth exposes per-partner referral performance", () => {
  assert.match(growthRoute, /partnerReferralStats/);
  assert.match(growthRoute, /referralUrl/);
  assert.match(growthRoute, /pipelineValue/);
  assert.match(growthPanel, /Kopier partnerlenke/);
  assert.match(growthPanel, /stats\.won/);
});

test("partner progression is explicit and never sends external communication", () => {
  assert.match(growthRoute, /action === "partner_progress"/);
  assert.match(growthRoute, /mark_engaged/);
  assert.match(growthRoute, /record_meeting/);
  assert.match(growthRoute, /activate_partner/);
  assert.match(growthRoute, /status = "PARTNER"/);
  assert.match(growthRoute, /externalAction: false/);
  assert.match(growthRoute, /emailSent: false/);
  assert.match(growthRoute, /invitationSent: false/);
});
