import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/cron/nexus-property-recommendation-send/route.ts", "utf8");
const sender = readFileSync("src/services/email/property-recommendation-send.ts", "utf8");
const template = readFileSync("src/services/email/property-recommendation-template.ts", "utf8");

test("property recommendation cron only scans explicitly authorized and preflight-ready work", () => {
  assert.match(source, /property_recommendation_auto_send_authorized/);
  assert.match(source, /send_preflight_ready/);
  assert.match(source, /sendApprovedPropertyRecommendation/);
  assert.match(source, /limit\(25\)/);
});

test("sender re-runs fresh preflight and uses durable exactly-once receipts", () => {
  assert.match(sender, /runNexusSendPreflight/);
  assert.match(sender, /nexus_property_recommendation_send_receipts/);
  assert.match(sender, /message_draft_id/);
  assert.match(sender, /status: "sending"/);
  assert.match(sender, /status: "sent"/);
  assert.match(sender, /status: "ambiguous"/);
  assert.match(sender, /Automatic retry is blocked/i);
});

test("sender uses CRM-aware brand mailer and the rich property template", () => {
  assert.match(sender, /buildPropertyRecommendationTemplate/);
  assert.match(sender, /sendBrandEmail/);
  assert.match(sender, /propertyCount < 1/);
  assert.match(template, /Se bilder og alle boligdetaljer/);
  assert.match(template, /Hvorfor den matcher/);
  assert.match(template, /Området|Om /);
});

test("cron reports the exact narrow policy and safety requirements", () => {
  assert.match(source, /property_recommendation_send_preapproved/);
  assert.match(source, /final_human_approval_required: true/);
  assert.match(source, /fresh_preflight_required: true/);
  assert.match(source, /durable_send_receipt_required: true/);
});
