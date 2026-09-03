import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260903212000_personal_intelligence_reviews.sql"),
  "utf8",
);

test("review foundation supports bounded review periods without a person score", () => {
  assert.match(migration, /review_type in \('daily','weekly','monthly','quarterly','annual'\)/i);
  assert.match(migration, /period_start timestamptz not null/i);
  assert.match(migration, /period_end timestamptz not null/i);
  assert.match(migration, /evidence_snapshot jsonb/i);
  assert.doesNotMatch(migration, /overall_score|person_score|productivity_score/i);
});

test("review dimensions stay separate", () => {
  for (const field of ["progress_summary", "friction_summary", "learning_summary", "decision_summary", "trajectory_summary"]) {
    assert.match(migration, new RegExp(`${field} text`, "i"));
  }
});

test("review subject is owner-guarded and service-only", () => {
  assert.match(migration, /enforce_review_owner_link/i);
  assert.match(migration, /e\.owner_user_id = new\.owner_user_id/i);
  assert.match(migration, /alter table mentor\.reviews enable row level security/i);
  assert.match(migration, /revoke all on mentor\.reviews from public, anon, authenticated/i);
  assert.match(migration, /grant all on mentor\.reviews to service_role/i);
});

test("review trigger is security invoker with locked search path", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
});

test("review evidence explicitly excludes hidden reasoning", () => {
  assert.match(migration, /must not contain hidden chain-of-thought/i);
});
