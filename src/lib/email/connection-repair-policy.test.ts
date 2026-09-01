import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_CONNECTION_REPAIR_CONFIRMATION,
  buildEmailConnectionHealthRepairPatch,
  resolveEmailConnectionRepairRequest,
} from "./connection-repair-policy";

test("email connection repair requires account id and explicit confirmation", () => {
  assert.deepEqual(resolveEmailConnectionRepairRequest({}), { ok: false, error: "accountId is required" });
  assert.equal(resolveEmailConnectionRepairRequest({ accountId: "account-1" }).ok, false);
  assert.deepEqual(
    resolveEmailConnectionRepairRequest({ accountId: " account-1 ", confirm: EMAIL_CONNECTION_REPAIR_CONFIRMATION }),
    { ok: true, request: { accountId: "account-1" } }
  );
});

test("health repair patch clears only health/pause state and records verified success", () => {
  const now = "2026-08-31T15:00:00.000Z";
  const patch = buildEmailConnectionHealthRepairPatch(now);
  assert.deepEqual(patch, {
    auto_fetch_paused_by_system: false,
    health_status: "healthy",
    health_message: null,
    consecutive_failures: 0,
    last_error_at: null,
    last_success_at: now,
    updated_at: now,
  });
});

test("health repair patch cannot enable ingest or rotate credentials", () => {
  const patch = buildEmailConnectionHealthRepairPatch("2026-08-31T15:00:00.000Z") as Record<string, unknown>;
  for (const forbidden of [
    "auto_fetch",
    "encrypted_password",
    "encryption_iv",
    "email_address",
    "imap_host",
    "imap_port",
    "imap_secure",
    "smtp_host",
    "smtp_port",
    "smtp_secure",
  ]) {
    assert.equal(Object.hasOwn(patch, forbidden), false, `${forbidden} must not be changed by health repair`);
  }
});
