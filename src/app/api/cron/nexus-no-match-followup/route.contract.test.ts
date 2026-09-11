import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-no-match-followup/route.ts"),
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

test("no-match follow-up never mutates buyer criteria and escalates concrete profiles", () => {
  assert.match(source, /handleNoMatchClarification/);
  assert.match(source, /result\.status === "human_review"/);
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
