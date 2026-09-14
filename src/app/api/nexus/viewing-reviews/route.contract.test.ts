import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/app/api/nexus/viewing-reviews/route.ts", "utf8");

test("Viewing Coach reviews are admin-only and read from governed CRM work", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /from\("work_items"\)/);
  assert.match(source, /metadata->>viewing_coach_review_required/);
  assert.match(source, /source_type", "crm"/);
});

test("review payload includes coaching evidence and exact next action", () => {
  assert.match(source, /viewing_coach_sentiment/);
  assert.match(source, /viewing_coach_reasons/);
  assert.match(source, /viewing_coach_explicit_criteria/);
  assert.match(source, /viewing_coach_high_intent/);
  assert.match(source, /viewing_coach_should_rematch/);
  assert.match(source, /nextAction/);
});

test("review API is read-only and keeps all unsafe actions false", () => {
  assert.match(source, /buyerProfileMutated: false/);
  assert.match(source, /pipelineMutated: false/);
  assert.match(source, /customerMessageSent: false/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /sendBrandEmail|sendEmail\(|smtp/i);
});
