import assert from "node:assert/strict";
import test from "node:test";
import {
  filterEmailOperationAuditByBrand,
  normalizeEmailOperationAuditRow,
} from "./operations-audit";

test("email operations audit only exposes normalized metadata", () => {
  const row = normalizeEmailOperationAuditRow({
    id: "1",
    action: "email_history_backfill",
    agent_name: "nexus_communications",
    status: "success",
    created_at: "2026-09-01T09:00:00Z",
    details: {
      brand_id: "soleada",
      mode: "apply",
      inserted: 12,
      body_text: "sensitive content",
      password: "secret",
      failed_accounts: [{ email: "a@example.com", error: "x".repeat(400) }],
    },
  });

  assert.equal(row?.brandId, "soleada");
  assert.equal(row?.inserted, 12);
  assert.equal(row?.failedAccounts[0].error?.length, 300);
  assert.equal("body_text" in (row || {}), false);
  assert.equal("password" in (row || {}), false);
});

test("email operations audit rejects unrelated actions and filters exact brand", () => {
  assert.equal(
    normalizeEmailOperationAuditRow({ id: "x", action: "other", status: "success", created_at: "2026-09-01T09:00:00Z" }),
    null
  );
  const filtered = filterEmailOperationAuditByBrand(
    [{ brandId: "soleada", id: 1 }, { brandId: "zeneco", id: 2 }],
    "Soleada"
  );
  assert.deepEqual(filtered, [{ brandId: "soleada", id: 1 }]);
});
