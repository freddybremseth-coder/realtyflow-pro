import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003034500_care_plan_pricing_alignment.sql", "utf8");

test("Care operational plan prices match the public Care offer", () => {
  assert.match(migration, /when 'basic' then 5500/);
  assert.match(migration, /when 'standard' then 8900/);
  assert.match(migration, /when 'premium' then 16900/);
  assert.match(migration, /where lower\(code\) in \('basic', 'standard', 'premium'\)/);
});
