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

test("feedback work is idempotent even after the original work item is completed", () => {
  assert.match(source, /\.eq\("source_id", sourceId\)/);
  assert.doesNotMatch(source, /\.in\("status", OPEN_STATUSES\)/);
  assert.doesNotMatch(source, /const OPEN_STATUSES/);
});

test("reprocessing does not rewrite the same CRM interaction but still permits downstream retry", () => {
  assert.match(source, /alreadyRecorded = existingInteractions\.some/);
  assert.match(source, /if \(!alreadyRecorded\)/);
  assert.match(source, /repeated \+= 1/);
  assert.match(source, /recordPropertyFeedbackRevenueEvents/);
  assert.match(source, /ensureFeedbackWorkItem/);
});

test("CRM reply classification uses the same governed feedback classification as work metadata", () => {
  assert.match(source, /function feedbackClassification/);
  assert.match(source, /analysis\.requiresBuyerProfileReview\) return "update_preferences"/);
  assert.match(source, /last_reply_classification: classification/);
  assert.match(source, /const classification = feedbackClassification\(input\.analysis\)/);
});

test("property feedback creates idempotent property-level revenue outcomes", () => {
  assert.match(source, /insertRevenueEvent/);
  assert.match(source, /buildRevenueEventDedupeKey/);
  assert.match(source, /property_interested/);
  assert.match(source, /property_not_for_me/);
  assert.match(source, /sourceSystem: "nexus_property_feedback"/);
  assert.match(source, /actorType: "customer"/);
  assert.match(source, /emailMessageId/);
  assert.match(source, /propertyKey/);
  assert.match(source, /revenue_events_recorded/);
});

test("property feedback telemetry separates inserted revenue events from idempotent duplicates", () => {
  assert.match(source, /let inserted = 0/);
  assert.match(source, /let duplicates = 0/);
  assert.match(source, /result\.ok && result\.duplicate/);
  assert.match(source, /revenueEventsInserted \+= revenueEventResult\.inserted/);
  assert.match(source, /revenueEventsDuplicate \+= revenueEventResult\.duplicates/);
  assert.match(source, /const revenueEventsRecorded = revenueEventsInserted \+ revenueEventsDuplicate/);
  assert.match(source, /revenue_events_inserted: revenueEventsInserted/);
  assert.match(source, /revenue_events_duplicate: revenueEventsDuplicate/);
});

test("questions are not falsely recorded as positive or negative revenue outcomes", () => {
  assert.match(source, /if \(signal\.sentiment === "question"\) continue/);
});

test("property feedback processor never sends customer communication", () => {
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /sendEmail\(/);
  assert.doesNotMatch(source, /smtp/i);
});