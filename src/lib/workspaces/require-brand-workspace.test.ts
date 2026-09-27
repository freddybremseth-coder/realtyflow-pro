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

test("narrow member role is disabled by default and gates every module", () => {
  const previous = process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  try {
    for (const permission of ["crm.read", "crm.write", "properties.catalog.read", "marketing.publish"] as const) {
      assert.equal(roleAllowsWorkspacePermission("WORKSPACE_MEMBER", permission), false);
    }
    process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
    assert.equal(roleAllowsWorkspacePermission("WORKSPACE_MEMBER", "crm.read"), true);
  } finally {
    if (previous === undefined) delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
    else process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = previous;
  }
});
