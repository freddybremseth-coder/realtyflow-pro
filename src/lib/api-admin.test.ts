import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { ADMIN_SESSION_REQUIRED_MESSAGE, requireAdminApi } from "@/lib/api-admin";

function requestWithCookie(cookie?: string) {
  return new NextRequest("https://realtyflow.test/api/internal", {
    headers: cookie ? { cookie } : {},
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "api-admin-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
});

test("requireAdminApi returns a 401 JSON response without admin cookie", async () => {
  const response = await requireAdminApi(requestWithCookie(), { items: [] });

  assert.equal(response?.status, 401);
  assert.deepEqual(await response?.json(), {
    items: [],
    error: ADMIN_SESSION_REQUIRED_MESSAGE,
  });
});

test("requireAdminApi rejects valid sessions for non-admin emails", async () => {
  const token = await createAdminSession("not-admin@example.com");
  const response = await requireAdminApi(requestWithCookie(`realtyflow_admin=${token}`));

  assert.equal(response?.status, 401);
  assert.deepEqual(await response?.json(), {
    error: ADMIN_SESSION_REQUIRED_MESSAGE,
  });
});

test("requireAdminApi returns null for a valid admin session", async () => {
  const token = await createAdminSession("freddy.bremseth@gmail.com");
  const response = await requireAdminApi(requestWithCookie(`realtyflow_admin=${token}`));

  assert.equal(response, null);
});

function remasterProxyRequest(headers: Record<string, string>) {
  return new NextRequest("https://realtyflow.test/api/neural-beat/image-bank", { headers });
}

test("requireAdminApi accepts the Re-Master proxy secret with an admin email", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "proxy-test-secret";
  const response = await requireAdminApi(remasterProxyRequest({
    "x-remaster-migration-secret": "proxy-test-secret",
    "x-remaster-admin": "freddy.bremseth@gmail.com",
  }));

  assert.equal(response, null);
});

test("requireAdminApi rejects the Re-Master proxy with wrong secret or non-admin email", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "proxy-test-secret";

  const wrongSecret = await requireAdminApi(remasterProxyRequest({
    "x-remaster-migration-secret": "wrong",
    "x-remaster-admin": "freddy.bremseth@gmail.com",
  }));
  assert.equal(wrongSecret?.status, 401);

  const wrongEmail = await requireAdminApi(remasterProxyRequest({
    "x-remaster-migration-secret": "proxy-test-secret",
    "x-remaster-admin": "not-admin@example.com",
  }));
  assert.equal(wrongEmail?.status, 401);
});
