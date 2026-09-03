import assert from "node:assert/strict";
import test from "node:test";
import { allowedPrivacyLevels, canUsePersonalContext } from "./privacy-policy";

test("internal sessions cannot read private or more sensitive context", () => {
  assert.deepEqual(allowedPrivacyLevels("internal"), ["public", "internal"]);
  assert.equal(
    canUsePersonalContext({ requestedLevel: "private", sessionScope: "internal" }).allow,
    false,
  );
});

test("private sessions can read private but not sensitive context by default", () => {
  assert.deepEqual(allowedPrivacyLevels("private"), ["public", "internal", "private"]);
  assert.equal(
    canUsePersonalContext({ requestedLevel: "sensitive", sessionScope: "sensitive" }).allow,
    false,
  );
});

test("sensitive context needs both sufficient scope and explicit permission", () => {
  const allowed = canUsePersonalContext({
    requestedLevel: "sensitive",
    sessionScope: "sensitive",
    explicitSensitivePermission: true,
  });
  assert.equal(allowed.allow, true);

  assert.deepEqual(allowedPrivacyLevels("restricted", true), [
    "public",
    "internal",
    "private",
    "sensitive",
    "restricted",
  ]);
});

test("restricted context is denied when permission is absent even in restricted scope", () => {
  const result = canUsePersonalContext({
    requestedLevel: "restricted",
    sessionScope: "restricted",
  });
  assert.equal(result.allow, false);
  assert.match(result.reason, /requires explicit/i);
});
