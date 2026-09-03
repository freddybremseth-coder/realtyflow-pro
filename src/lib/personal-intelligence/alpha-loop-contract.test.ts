import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260903193000_personal_intelligence_alpha_loop.sql"),
  "utf8",
);
const todayRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/personal-intelligence/today/route.ts"),
  "utf8",
);
const todayService = fs.readFileSync(
  path.join(process.cwd(), "src/lib/personal-intelligence/today-service.ts"),
  "utf8",
);

test("alpha loop keeps ideas separate from commitments", () => {
  assert.match(migration, /commitment_status in \('idea','considering','committed','scheduled','in_progress','done','dropped'\)/i);
  assert.match(todayService, /\.in\("commitment_status", \["committed", "scheduled", "in_progress"\]\)/);
  assert.doesNotMatch(todayService, /\["idea".*"committed"/);
});

test("TODAY remains owner-only and service mediated", () => {
  assert.match(todayRoute, /access\.role !== "OWNER"/);
  assert.match(todayRoute, /getPersonalIntelligenceOwnerUserId/);
  assert.match(migration, /revoke all on mentor\.recommendations, mentor\.actions, mentor\.followups from public, anon, authenticated/i);
});

test("learning reviews feed TODAY without streak mechanics", () => {
  assert.match(migration, /create table if not exists learning\.review_schedule/i);
  assert.match(todayService, /type: "learning_review"/);
  assert.doesNotMatch(migration, /streak/i);
  assert.doesNotMatch(todayService, /streak/i);
});
