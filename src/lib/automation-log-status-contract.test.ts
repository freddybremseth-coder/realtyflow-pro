import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914181500_automation_logs_status_contract_v2.sql", import.meta.url),
  "utf8",
);

const normalized = migration.replace(/\s+/g, " ").toLowerCase();

test("automation_logs status contract keeps the status vocabulary explicit and bounded", () => {
  assert.match(normalized, /alter table public\.automation_logs drop constraint if exists automation_logs_status_check/);
  assert.match(normalized, /alter table public\.automation_logs add constraint automation_logs_status_check check/);

  for (const status of ["success", "error", "partial", "failed", "blocked"]) {
    assert.match(normalized, new RegExp(`'${status}'`));
  }

  assert.doesNotMatch(normalized, /status\s+is\s+not\s+null/);
  assert.doesNotMatch(normalized, /drop\s+constraint\s+if\s+exists\s+automation_logs_status_check\s*;\s*$/);
});

test("automation_logs status contract does not silently widen to arbitrary text", () => {
  const checkMatch = normalized.match(/check\s*\(status\s+in\s*\(([^)]*)\)\)/);
  assert.ok(checkMatch, "expected an explicit status IN (...) check constraint");

  const statuses = [...checkMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(statuses, ["blocked", "error", "failed", "partial", "success"]);
});
