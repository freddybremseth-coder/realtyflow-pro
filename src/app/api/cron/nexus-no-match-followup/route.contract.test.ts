import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-no-match-followup/route.ts"),
  "utf8",
);
const coachSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/no-match-clarification.ts"),
  "utf8",
);
const matchingSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-property-match-prep/route.ts"),
  "utf8",
);
const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

test("zero-match property runs are routed into one explicit follow-up state", () => {
  assert.match(matchingSource, /NO_MATCHES_FOUND|noMatch/);
  assert.match(matchingSource, /no_match_followup_required:\s*true/);
  assert.match(matchingSource, /kriteriene endres ikke automatisk/i);
  assert.match(source, /metadata\.no_match_followup_at \|\| metadata\.no_match_followup_status/);
});

test("No-Match Coach is prepare-only and never sends customer email from cron", () => {
  assert.match(source, /prepareNoMatchCoach/);
  assert.match(source, /no_match_review_required:\s*reviewRequired/);
  assert.match(source, /no_match_customer_send:\s*false/);
  assert.match(source, /customer_send:\s*false/);
  assert.match(source, /Gjennomgå utkastet før eventuell kundekontakt/);
  assert.doesNotMatch(source, /sendBrandEmail|sendEmail\(|smtp/i);
  assert.doesNotMatch(coachSource, /sendBrandEmail|sendEmail\(|smtp/i);
});

test("No-Match Coach stores one precise question and draft without mutating criteria", () => {
  assert.match(source, /no_match_coach_question/);
  assert.match(source, /no_match_constraint_focus/);
  assert.match(source, /no_match_draft_subject/);
  assert.match(source, /no_match_draft_body/);
  assert.match(coachSource, /questions:\s*\[primaryQuestion\]/);
  assert.match(coachSource, /primaryQuestion/);
  assert.match(source, /Kriteriene endres ikke automatisk/);
  assert.match(source, /criteria_mutated:\s*false/);
  assert.doesNotMatch(source, /buyer_profile_criteria[\s\S]*\.update\(/);
  assert.doesNotMatch(source, /buyer_profiles[\s\S]*\.update\(/);
});

test("no-match follow-up runs after matching and presentation preparation", () => {
  const propertyMatch = vercel.indexOf('"/api/cron/nexus-property-match-prep"');
  const presentation = vercel.indexOf('"/api/cron/nexus-presentation-prep"');
  const noMatch = vercel.indexOf('"/api/cron/nexus-no-match-followup"');
  assert.ok(propertyMatch >= 0 && presentation > propertyMatch && noMatch > presentation);
  assert.match(vercel, /nexus-no-match-followup[^\n]+7-59\/5/);
});
