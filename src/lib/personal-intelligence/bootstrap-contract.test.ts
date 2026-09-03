import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/bootstrap/route.ts"), "utf8");
const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260903190500_personal_intelligence_entity_identity.sql"), "utf8");

test("private-alpha bootstrap is owner-only and binds the configured auth owner", () => {
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /getPersonalIntelligenceOwnerUserId\(\)/);
  assert.match(route, /entity_type", "person"/);
  assert.match(route, /canonical_owner: true/);
});

test("canonical entity identity is unique per owner, entity type and canonical name", () => {
  assert.match(migration, /create unique index if not exists personal_core_entities_owner_type_canonical_uidx/i);
  assert.match(migration, /owner_user_id, entity_type, canonical_name/i);
  assert.match(migration, /where canonical_name is not null/i);
});
