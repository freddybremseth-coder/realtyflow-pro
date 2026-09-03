import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/reviews/weekly/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/review/page.tsx"), "utf8");

test("weekly review is owner-only and evidence bounded", () => {
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(route, /Review period cannot exceed 31 days/);
  assert.match(route, /source_window/);
  assert.match(route, /evidence_snapshot/);
});

test("weekly review does not manufacture an empty review", () => {
  assert.match(route, /if \(evidenceCount === 0\)/);
  assert.match(route, /generated: false/);
  assert.match(route, /No Personal Intelligence evidence exists in this review window/);
});

test("review dimensions remain separate and reject aggregate person scoring", () => {
  for (const field of ["progress_summary", "friction_summary", "learning_summary", "decision_summary", "trajectory_summary"]) assert.match(route, new RegExp(field));
  assert.doesNotMatch(route, /person_score|overall_score|productivity_score/i);
  assert.match(page, /ingen samlet Freddy-score/i);
});

test("activity is not equated with mastery or life progress", () => {
  assert.match(route, /activity evidence, not proof of mastery/i);
  assert.match(route, /does not infer life trajectory from activity volume alone/i);
  assert.match(page, /Activity volume is not treated as life progress by itself/i);
});

test("weekly review is generated on demand and has explicit acceptance", () => {
  assert.match(page, /Generate 7-day review/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /status: "accepted"/);
  assert.match(route, /accepted_at/);
});

test("weekly review runtime has no autonomous external execution", () => {
  assert.doesNotMatch(route, /destination_system|external_action_id|fetch\([^)]*https?:\/\//i);
});
