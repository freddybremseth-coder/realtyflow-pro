import assert from "node:assert/strict";
import { test } from "node:test";
import { REALTYFLOW_APPS, REALTYFLOW_APP_BY_ID, appVisibleForRole } from "@/lib/platform-apps";
import { permissionsForRole } from "@/lib/access-control";

test("RealtyFlow has four work apps plus owner operations", () => {
  assert.deepEqual(REALTYFLOW_APPS.map((app) => app.id), [
    "sales",
    "marketing",
    "content",
    "finance",
    "operations",
  ]);
  assert.equal(REALTYFLOW_APP_BY_ID.sales.href, "/sales");
  assert.equal(REALTYFLOW_APP_BY_ID.finance.href, "/finance");
});

test("app visibility follows the existing permission model", () => {
  const salesPermissions = permissionsForRole("SALES");
  assert.equal(appVisibleForRole(REALTYFLOW_APP_BY_ID.sales, "SALES", salesPermissions), true);
  assert.equal(appVisibleForRole(REALTYFLOW_APP_BY_ID.marketing, "SALES", salesPermissions), true);
  assert.equal(appVisibleForRole(REALTYFLOW_APP_BY_ID.finance, "SALES", salesPermissions), false);
  assert.equal(appVisibleForRole(REALTYFLOW_APP_BY_ID.operations, "SALES", salesPermissions), false);

  const financePermissions = permissionsForRole("FINANCE");
  assert.equal(appVisibleForRole(REALTYFLOW_APP_BY_ID.finance, "FINANCE", financePermissions), true);
  assert.equal(appVisibleForRole(REALTYFLOW_APP_BY_ID.operations, "FINANCE", financePermissions), false);

  assert.equal(appVisibleForRole(REALTYFLOW_APP_BY_ID.operations, "OWNER", permissionsForRole("OWNER")), true);
});

test("each work app points to existing module routes instead of duplicating data domains", () => {
  for (const app of REALTYFLOW_APPS) {
    assert.ok(app.modules.length >= 4);
    assert.equal(new Set(app.modules.map((module) => module.href)).size, app.modules.length);
  }
});
