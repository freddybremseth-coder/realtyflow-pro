import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/cron/nexus-property-feedback/route.ts", "utf8");

test("property feedback cron is scheduler-authenticated and read-reply driven", () => {
  assert.match(source, /requireNexusSchedulerApi/);
  assert.match(source, /email_messages/);
  assert.match(source, /direction", "inbound"/);
  assert.match(source, /nexus_property_recommendation_send_receipts/);
  assert.match(source, /buildLeadCustomerPresentationPreview/);
  assert.match(source, /analyzePropertyRecommendationReply/);
});

test("preference-changing feedback does not mutate Buyer Profile automatically", () => {
  assert.match(source, /buyer_profile_revision_required/);
  assert.match(source, /REVIEW_REQUIRED/);
  assert.match(source, /buyer_profile_auto_mutation: false/);
  assert.doesNotMatch(source, /from\("buyer_profiles"\)\.update/);
});

test("property feedback pauses nurture and creates governed sales work", () => {
  assert.match(source, /nurture_status: "paused"/);
  assert.match(source, /property_recommendation_feedback/);
  assert.match(source, /property_feedback_signals/);
  assert.match(source, /property_match_prepared_at: null/);
});

test("property feedback processor never sends customer communication", () => {
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /sendEmail\(/);
  assert.doesNotMatch(source, /smtp/i);
});
