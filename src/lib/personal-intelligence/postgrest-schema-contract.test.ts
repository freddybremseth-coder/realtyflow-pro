import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260904190500_personal_intelligence_postgrest_schemas.sql"),
  "utf8",
);

test("Personal Intelligence schemas are exposed to PostgREST without widening client grants", () => {
  assert.match(migration, /alter role authenticator set pgrst\.db_schemas/i);
  for (const schema of ["personal_core", "mentor", "knowledge", "learning", "beliefs"]) {
    assert.match(migration, new RegExp(`\\b${schema}\\b`, "i"));
  }
  assert.match(migration, /notify pgrst, 'reload config'/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
  assert.doesNotMatch(migration, /grant\s+usage\s+on\s+schema[\s\S]*\b(?:anon|authenticated)\b/i);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete|all)[\s\S]*\b(?:anon|authenticated)\b/i);
});
