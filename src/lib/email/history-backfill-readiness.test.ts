import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEmailHistoryBackfillReadiness } from "./history-backfill-readiness";

const ready = {
  email_address: "ready@example.com",
  is_active: true,
  imap_host: "imap.example.com",
  encrypted_password: "encrypted",
  encryption_iv: "iv",
  health_status: "healthy",
  auto_fetch_paused_by_system: false,
  last_success_at: "2026-08-31T12:00:00.000Z",
  consecutive_failures: 0,
};

test("all ready accounts allow historical backfill", () => {
  const result = evaluateEmailHistoryBackfillReadiness([ready]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockedAccounts, []);
});

test("system-paused account blocks preview and apply readiness", () => {
  const result = evaluateEmailHistoryBackfillReadiness([{
    ...ready,
    email_address: "paused@example.com",
    health_status: "paused",
    health_message: "Command failed",
    auto_fetch_paused_by_system: true,
    last_success_at: null,
    consecutive_failures: 3,
  }]);
  assert.equal(result.ok, false);
  assert.equal(result.blockedAccounts.length, 1);
  assert.equal(result.blockedAccounts[0]?.email, "paused@example.com");
  assert.equal(result.blockedAccounts[0]?.state, "paused");
  assert.equal(result.blockedAccounts[0]?.reason, "Command failed");
});

test("one non-ready account blocks a multi-account brand", () => {
  const result = evaluateEmailHistoryBackfillReadiness([
    ready,
    {
      ...ready,
      email_address: "never@example.com",
      last_success_at: null,
      health_status: "healthy",
    },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockedAccounts.map((row) => row.email), ["never@example.com"]);
  assert.equal(result.blockedAccounts[0]?.state, "never_verified");
});

test("blocked result never exposes credential material", () => {
  const result = evaluateEmailHistoryBackfillReadiness([{
    ...ready,
    email_address: "missing@example.com",
    encrypted_password: null,
    encryption_iv: null,
  }]);
  assert.equal(result.ok, false);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /encrypted_password|encryption_iv|encrypted/);
});
