import assert from "node:assert/strict";
import test from "node:test";
import { isValidDonaAnnaIntegrationSecret } from "@/lib/dona-anna/integration-auth";

test("integration secrets require sufficient entropy and exact equality", () => {
  const secret = "a-secure-integration-secret-with-32-chars";
  assert.equal(isValidDonaAnnaIntegrationSecret(secret, secret), true);
  assert.equal(isValidDonaAnnaIntegrationSecret(secret, `${secret}-wrong`), false);
  assert.equal(isValidDonaAnnaIntegrationSecret("short", "short"), false);
  assert.equal(isValidDonaAnnaIntegrationSecret(secret, ""), false);
});
