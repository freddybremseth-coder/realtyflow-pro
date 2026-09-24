import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedBrandGrant, isCanonicalBrandKey } from "./brand-policy";

const allowed = {
  grant: { brand_id: "pinoso-brand-uuid", user_id: "auth-user-uuid", email: "andrea@example.test", status: "active", permissions: ["crm.read", "marketing.draft"] },
  brandId: "pinoso-brand-uuid",
  sessionEmail: "andrea@example.test",
  verifiedUserId: "auth-user-uuid",
  verifiedUserEmail: "andrea@example.test",
  permission: "crm.read" as const,
};

test("a matching verified user, brand and explicit permission passes", () => {
  assert.equal(hasVerifiedBrandGrant(allowed), true);
});
test("wrong brand, spoofed session or mismatched auth identity never passes", () => {
  assert.equal(hasVerifiedBrandGrant({ ...allowed, brandId: "zeneco-brand-uuid" }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, sessionEmail: "another@example.test" }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, verifiedUserId: "another-user-uuid" }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, verifiedUserEmail: "another@example.test" }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, grant: { ...allowed.grant, email: "another@example.test" } }), false);
});
test("disabled, revoked, absent and ungranted capabilities fail closed", () => {
  assert.equal(hasVerifiedBrandGrant({ ...allowed, grant: null }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, grant: { ...allowed.grant, status: "revoked" } }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, grant: { ...allowed.grant, status: "disabled" } }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, permission: "crm.write" }), false);
  assert.equal(hasVerifiedBrandGrant({ ...allowed, grant: { ...allowed.grant, permissions: null } }), false);
});
test("only canonical, non-interpolated brand keys are accepted", () => {
  assert.equal(isCanonicalBrandKey("pinosoecolife"), true);
  for (const value of ["PinosoEcolife", "pinosoecolife,zeneco", "pinosoecolife)or(id.not.is.null", "", "../zeneco", " pinosoecolife "]) {
    assert.equal(isCanonicalBrandKey(value), false);
  }
});
