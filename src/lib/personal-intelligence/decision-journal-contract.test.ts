import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260903205500_personal_intelligence_decision_journal.sql"),
  "utf8",
);

test("Decision Journal separates decisions, options, assumptions and outcomes", () => {
  assert.match(migration, /create table if not exists mentor\.decisions/i);
  assert.match(migration, /create table if not exists mentor\.decision_options/i);
  assert.match(migration, /create table if not exists mentor\.decision_assumptions/i);
  assert.match(migration, /create table if not exists mentor\.decision_outcomes/i);
});

test("decision quality, outcome quality and luck remain separate review dimensions", () => {
  assert.match(migration, /decision_quality numeric/i);
  assert.match(migration, /outcome_quality numeric/i);
  assert.match(migration, /luck_factor numeric/i);
  assert.match(migration, /outcome quality must not be treated as decision quality/i);
});

test("Decision Journal preserves what was known and uncertain at decision time", () => {
  assert.match(migration, /context_snapshot jsonb/i);
  assert.match(migration, /evidence_snapshot jsonb/i);
  assert.match(migration, /uncertainty_notes text/i);
  assert.match(migration, /premortem text/i);
  assert.match(migration, /scenario_notes text/i);
});

test("owner integrity is enforced across subject, goal and child decision records", () => {
  assert.match(migration, /enforce_decision_owner_links/);
  assert.match(migration, /Decision subject must belong to the same owner/);
  assert.match(migration, /Decision goal must belong to the same owner/);
  assert.match(migration, /foreign key \(decision_id, owner_user_id\)/i);
  assert.match(migration, /references mentor\.decisions\(id, owner_user_id\)/i);
});

test("a chosen option must belong to the same owner and the same decision", () => {
  assert.match(migration, /unique \(id, owner_user_id, decision_id\)/i);
  assert.match(migration, /foreign key \(chosen_option_id, owner_user_id, id\)/i);
  assert.match(migration, /references mentor\.decision_options\(id, owner_user_id, decision_id\) on delete restrict/i);
});

test("Decision Journal remains private-by-default and service mediated", () => {
  assert.match(migration, /alter table mentor\.decisions enable row level security/i);
  assert.match(migration, /alter table mentor\.decision_options enable row level security/i);
  assert.match(migration, /alter table mentor\.decision_assumptions enable row level security/i);
  assert.match(migration, /alter table mentor\.decision_outcomes enable row level security/i);
  assert.match(migration, /revoke all on mentor\.decisions, mentor\.decision_options, mentor\.decision_assumptions, mentor\.decision_outcomes\s+from public, anon, authenticated/i);
  assert.match(migration, /grant all on mentor\.decisions, mentor\.decision_options, mentor\.decision_assumptions, mentor\.decision_outcomes\s+to service_role/i);
});

test("Decision Journal models reversibility, stakes and assumption testability explicitly", () => {
  assert.match(migration, /reversibility in \('one_way','two_way','mixed','unknown'\)/i);
  assert.match(migration, /stakes in \('low','medium','high','critical'\)/i);
  assert.match(migration, /testability in \('testable','partly_testable','not_testable','unknown'\)/i);
  assert.match(migration, /status in \('active','testing','confirmed','weakened','invalidated','retired'\)/i);
});
