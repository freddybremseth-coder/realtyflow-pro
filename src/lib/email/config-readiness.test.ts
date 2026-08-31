import test from "node:test";
import assert from "node:assert/strict";
import { classifyEmailConfigReadiness } from "./config-readiness";

const base = {
  is_active: true,
  imap_host: "imap.hostinger.com",
  encrypted_password: "ciphertext",
  encryption_iv: "iv",
  health_status: "healthy",
  health_message: null,
  auto_fetch_paused_by_system: false,
  last_success_at: "2026-08-31T12:00:00.000Z",
  consecutive_failures: 0,
};

test("ready requires verified credentials, IMAP and successful connection", () => {
  assert.deepEqual(classifyEmailConfigReadiness(base), {
    state: "ready",
    credentialsConfigured: true,
    connectionVerified: true,
    canAttemptConnection: true,
    canBackfill: true,
    reason: "Mailbox configuration has verified credentials and a successful connection.",
  });
});

test("system pause blocks backfill but preserves connection attempt eligibility", () => {
  const result = classifyEmailConfigReadiness({
    ...base,
    health_status: "paused",
    health_message: "Command failed",
    auto_fetch_paused_by_system: true,
    last_success_at: null,
    consecutive_failures: 3,
  });

  assert.equal(result.state, "paused");
  assert.equal(result.credentialsConfigured, true);
  assert.equal(result.connectionVerified, false);
  assert.equal(result.canAttemptConnection, true);
  assert.equal(result.canBackfill, false);
  assert.equal(result.reason, "Command failed");
});

test("missing credentials block connection and backfill", () => {
  const result = classifyEmailConfigReadiness({
    ...base,
    encrypted_password: null,
    encryption_iv: null,
  });
  assert.equal(result.state, "missing_credentials");
  assert.equal(result.canAttemptConnection, false);
  assert.equal(result.canBackfill, false);
});

test("never verified mailbox cannot backfill", () => {
  const result = classifyEmailConfigReadiness({
    ...base,
    health_status: null,
    last_success_at: null,
  });
  assert.equal(result.state, "never_verified");
  assert.equal(result.canAttemptConnection, true);
  assert.equal(result.canBackfill, false);
});

test("inactive mailbox cannot connect or backfill", () => {
  const result = classifyEmailConfigReadiness({ ...base, is_active: false });
  assert.equal(result.state, "inactive");
  assert.equal(result.canAttemptConnection, false);
  assert.equal(result.canBackfill, false);
});
