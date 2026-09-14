import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/app/api/cron/nexus-viewing-coach/route.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

test("Viewing Coach is driven only by canonical completed-viewing events", () => {
  assert.match(source, /from\("revenue_events"\)/);
  assert.match(source, /\.eq\("event_type", "viewing_completed"\)/);
  assert.match(source, /buildViewingCoachPlan/);
});

test("Viewing Coach feeds taste learning as secondary property feedback", () => {
  assert.match(source, /type: "property_feedback"/);
  assert.match(source, /source: "nexus-viewing-coach"/);
  assert.match(source, /secondary_ranking_only: true/);
  assert.match(source, /signals: \[plan\.tasteSignal\]/);
});

test("safe rematch is prepared only with an approved unchanged Buyer Profile", () => {
  assert.match(source, /approvedProfile/);
  assert.match(source, /canRematch = plan\.shouldRematch && approvedProfile && !plan\.requiresBuyerProfileReview/);
  assert.match(source, /classification = plan\.requiresBuyerProfileReview/);
  assert.match(source, /property_match_prepared_at: canRematch \? null : now/);
});

test("explicit criteria changes are review-gated and never mutate Buyer Profile", () => {
  assert.match(source, /buyer_profile_status: safeProfileStatus/);
  assert.match(source, /buyer_profile_revision_required: plan\.requiresBuyerProfileReview/);
  assert.match(source, /criteria_mutated: false/);
  assert.match(source, /buyer_profile_auto_mutation: false/);
  assert.doesNotMatch(source, /from\("buyer_profiles"\)\.update/);
});

test("Viewing Coach never sends customers or moves pipeline", () => {
  assert.match(source, /customer_send: false/);
  assert.match(source, /pipeline_mutated: false/);
  assert.match(source, /pipeline_auto_mutation: false/);
  assert.doesNotMatch(source, /sendBrandEmail|sendEmail\(|smtp/i);
  assert.doesNotMatch(source, /pipeline_status[\s\S]*\.update\(/);
});

test("Viewing Coach processing is idempotent by completed viewing event", () => {
  assert.match(source, /const sourceId = `\$\{eventId\}:viewing-coach`/);
  assert.match(source, /\.eq\("source_id", sourceId\)/);
  assert.match(source, /const interactionId = `viewing-coach-\$\{eventId\}`/);
});

test("Viewing Coach runs before a later property-match cycle", () => {
  assert.match(vercel, /nexus-viewing-coach/);
});
