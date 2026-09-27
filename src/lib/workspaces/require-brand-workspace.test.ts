import assert from "node:assert/strict";
import test from "node:test";
import { roleAllowsWorkspacePermission } from "./require-brand-workspace";

test("owner is allowed, but legacy global roles never become scoped staff members", () => {
  assert.equal(roleAllowsWorkspacePermission("OWNER", "crm.read"), true);
  for (const role of ["SALES", "MARKETING", "VIEWER", "CLOSING", "FINANCE", "KEYHOLDING"] as const) {
    assert.equal(roleAllowsWorkspacePermission(role, "crm.read"), false, role);
    assert.equal(roleAllowsWorkspacePermission(role, "properties.catalog.read"), false, role);
    assert.equal(roleAllowsWorkspacePermission(role, "marketing.publish"), false, role);
  }
});

test("narrow member role is eligible for scoped modules; runtime admission is enforced separately", () => {
  for (const permission of [
    "crm.read", "crm.write", "properties.catalog.read",
    "marketing.read", "marketing.draft", "marketing.publish",
  ] as const) {
    assert.equal(roleAllowsWorkspacePermission("WORKSPACE_MEMBER", permission), true, permission);
  }
});
