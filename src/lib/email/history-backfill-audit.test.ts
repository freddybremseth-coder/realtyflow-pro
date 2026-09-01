import assert from "node:assert/strict";
import test from "node:test";
import { buildEmailHistoryBackfillAuditDetails } from "./history-backfill-audit";

test("backfill audit payload is metadata-only and bounded", () => {
  const details = buildEmailHistoryBackfillAuditDetails({
    brandId: "soleada",
    mode: "apply",
    status: "blocked",
    sinceDays: 180,
    maxMessages: 200,
    includeSent: true,
    fetched: 42,
    candidates: 10,
    duplicates: 4,
    skippedMissingMessageId: 1,
    inserted: 0,
    accountFetchComplete: false,
    failedAccounts: [{ email: "a@example.com", error: "x".repeat(400) }],
    reason: "y".repeat(400),
  });

  assert.equal(details.brand_id, "soleada");
  assert.equal(details.message_content_logged, false);
  assert.equal(details.credentials_logged, false);
  assert.equal(details.automatic_crm_linking, false);
  assert.equal(details.email_sent, false);
  assert.equal(details.failed_accounts[0].error.length, 300);
  assert.equal(details.reason?.length, 300);
  assert.equal("body_text" in details, false);
  assert.equal("password" in details, false);
});
