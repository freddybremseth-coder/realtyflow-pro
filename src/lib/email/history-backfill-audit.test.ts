import assert from "node:assert/strict";
import test from "node:test";
import { buildEmailHistoryBackfillAuditLog } from "./history-backfill-audit";

test("email backfill audit log excludes message content and credentials", () => {
  const log = buildEmailHistoryBackfillAuditLog({
    status: "success",
    brandId: "soleada",
    mode: "apply",
    sinceDays: 180,
    maxMessages: 200,
    includeSent: true,
    fetched: 120,
    candidates: 40,
    duplicates: 80,
    skippedMissingMessageId: 0,
    inserted: 40,
    accountCount: 1,
    accountErrorCount: 0,
    previewFingerprintMatches: true,
  });

  assert.equal(log.action, "email_history_backfill");
  assert.equal(log.agent_name, "nexus_communications");
  assert.equal(log.status, "success");
  assert.equal(log.details.brand_id, "soleada");
  assert.equal(log.details.inserted, 40);
  assert.equal(log.details.message_content_logged, false);
  assert.equal(log.details.credentials_logged, false);
  assert.equal(log.details.automatic_crm_linking, false);
  assert.equal(log.details.email_sent, false);
});

test("email backfill audit log bounds error text", () => {
  const log = buildEmailHistoryBackfillAuditLog({
    status: "failed",
    brandId: "soleada",
    mode: "apply",
    sinceDays: 180,
    maxMessages: 200,
    includeSent: true,
    fetched: 0,
    candidates: 0,
    duplicates: 0,
    skippedMissingMessageId: 0,
    inserted: 0,
    accountCount: 1,
    accountErrorCount: 1,
    error: "x".repeat(600),
  });

  assert.equal(log.details.error?.length, 300);
});
