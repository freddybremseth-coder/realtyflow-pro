import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const readMigration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), "supabase/migrations", name), "utf8");

const schemas = readMigration("20260903184000_personal_intelligence_schemas.sql");
const core = readMigration("20260903184500_personal_intelligence_core.sql");
const mentor = readMigration("20260903185000_personal_intelligence_mentor.sql");
const learning = readMigration("20260903185500_personal_intelligence_learning.sql");
const claimRuntime = readMigration("20260903190000_personal_intelligence_claim_runtime.sql");

test("personal intelligence uses isolated schemas without colliding with RealtyFlow core", () => {
  assert.match(schemas, /create schema if not exists personal_core/i);
  assert.match(schemas, /create schema if not exists mentor/i);
  assert.match(schemas, /create schema if not exists knowledge/i);
  assert.match(schemas, /create schema if not exists learning/i);
  assert.match(schemas, /create schema if not exists beliefs/i);
  assert.doesNotMatch(schemas, /create schema if not exists core\s*;/i);
});

test("personal intelligence schemas are private by default", () => {
  assert.match(
    schemas,
    /revoke all on schema personal_core, mentor, knowledge, learning, beliefs from public, anon, authenticated/i,
  );
  assert.match(schemas, /grant usage on schema personal_core, mentor, knowledge, learning, beliefs to service_role/i);
});

test("canonical personal claims preserve provenance, confidence and correction lifecycle", () => {
  assert.match(core, /create table if not exists personal_core\.sources/i);
  assert.match(core, /create table if not exists personal_core\.claims/i);
  assert.match(core, /source_id uuid references personal_core\.sources/i);
  assert.match(core, /confidence numeric\(5,4\)/i);
  assert.match(core, /supersedes_claim_id uuid references personal_core\.claims/i);
  assert.match(core, /create table if not exists personal_core\.claim_conflicts/i);
  assert.match(core, /enable row level security/i);
  assert.match(core, /revoke all on all tables in schema personal_core from public, anon, authenticated/i);
});

test("claim correction is atomic, owner-scoped and service-only", () => {
  assert.match(claimRuntime, /create or replace function personal_core\.correct_claim/i);
  assert.match(claimRuntime, /where id = p_claim_id\s+and owner_user_id = p_owner_user_id/is);
  assert.match(claimRuntime, /update personal_core\.claims\s+set status = 'superseded'/is);
  assert.match(claimRuntime, /supersedes_claim_id/is);
  assert.match(claimRuntime, /grant execute on function personal_core\.correct_claim[\s\S]*to service_role/i);
  assert.match(claimRuntime, /revoke all on function personal_core\.correct_claim[\s\S]*from public, anon, authenticated/i);
});

test("mentor runtime records context usage without storing hidden reasoning", () => {
  assert.match(mentor, /create table if not exists mentor\.sessions/i);
  assert.match(mentor, /think_deeper_enabled boolean/i);
  assert.match(mentor, /create table if not exists mentor\.context_usage/i);
  assert.match(mentor, /context_reason text not null/i);
  assert.match(mentor, /create table if not exists mentor\.audit_events/i);
  assert.match(mentor, /never stores hidden chain-of-thought/i);
});

test("knowledge mastery keeps unknown distinct from zero and uses teach-back evidence", () => {
  assert.match(learning, /create table if not exists knowledge\.mastery/i);
  assert.match(learning, /understanding_score numeric\(5,4\) check \(understanding_score is null/i);
  assert.match(learning, /create table if not exists learning\.teach_back/i);
  assert.match(learning, /create table if not exists knowledge\.mastery_evidence/i);
  assert.match(learning, /NULL means unknown, never zero knowledge/i);
});

test("beliefs are isolated from factual personal claims", () => {
  assert.match(learning, /create table if not exists beliefs\.claims/i);
  assert.match(learning, /belief_type in \('belief','hypothesis','principle','preference','prediction','assumption'\)/i);
  assert.match(learning, /create table if not exists beliefs\.predictions/i);
});
