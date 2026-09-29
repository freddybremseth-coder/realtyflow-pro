import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260929222605_nexus_property_content_learning_snapshots.sql",
  "utf8",
);

test("editorial learning snapshots remain server-only and observe-only", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.property_content_learning_snapshots from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on public\.property_content_learning_snapshots to service_role/i);
  assert.match(migration, /insufficient','emerging','measured/);
  assert.match(migration, /does not authorize automatic strategy or scoring changes/i);
  assert.doesNotMatch(migration, /create policy/i);
});
