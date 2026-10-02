import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261002220500_care_lead_onboarding.sql", "utf8");

test("Care onboarding migration defines one complete atomic function", () => {
  assert.equal((migration.match(/create or replace function public\.care_onboard_lead/g) || []).length, 1);
  assert.equal((migration.match(/grant execute on function public\.care_onboard_lead/g) || []).length, 1);
  assert.equal((migration.match(/revoke all on function public\.care_onboard_lead/g) || []).length, 1);
  assert.match(migration, /\$\$;\s*\n\s*revoke all on function public\.care_onboard_lead/);
  assert.doesNotMatch(migration, /service_role;\s*then\b/i);
});

test("Care onboarding is idempotent for property and active contract", () => {
  assert.match(migration, /metadata->>'care_property_id'/);
  assert.match(migration, /lower\(btrim\(address_line\)\) = lower\(btrim\(p_address_line\)\)/);
  assert.match(migration, /status in \('active', 'renewal_due'\)/);
  assert.match(migration, /An active Care contract already exists with a different plan/);
});

test("Care onboarding remains service-role only", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on function public\.care_onboard_lead[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.care_onboard_lead[\s\S]*to service_role/);
});
