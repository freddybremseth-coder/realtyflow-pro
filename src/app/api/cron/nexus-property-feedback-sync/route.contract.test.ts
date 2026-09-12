import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/cron/nexus-property-feedback-sync/route.ts", "utf8");
const parser = readFileSync("src/services/email/property-recommendation-feedback.ts", "utf8");

test("feedback sync only links replies to a previously sent property recommendation", () => {
  assert.match(source, /nexus_property_recommendation_send_receipts/);
  assert.match(source, /\.eq\("status", "sent"\)/);
  assert.match(source, /\.lte\("sent_at", message\.received_at\)/);
  assert.match(source, /lead_customer_presentations/);
  assert.match(source, /extractPropertyRecommendationFeedback/);
});

test("property feedback is persisted append-only and does not silently mutate Buyer Profile", () => {
  assert.match(source, /nexus_property_feedback_events/);
  assert.match(source, /buyer_profile_changes_auto_applied: false/);
  assert.doesNotMatch(source, /from\("buyer_profiles"\)\.update/);
  assert.doesNotMatch(source, /buyer_profile_criteria.*update/);
});

test("parser uses the latest reply and supports numbered and reference-based property feedback", () => {
  assert.match(parser, /extractLatestReplyText/);
  assert.match(parser, /nr\\\.?|nummer|number/);
  assert.match(parser, /input\.reference/);
  assert.match(parser, /price_too_high/);
  assert.match(parser, /location_negative/);
  assert.match(parser, /autoApply: false/);
});

test("viewing and positive property signals create governed sales work rather than autonomous commitments", () => {
  assert.match(source, /property_recommendation_feedback/);
  assert.match(source, /Verifiser tilgjengelighet og foreslå neste steg raskt/);
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /viewing_booking/);
});
