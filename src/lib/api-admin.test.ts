import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { ADMIN_SESSION_REQUIRED_MESSAGE, getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

function requestWithCookie(cookie?: string) {
  return new NextRequest("https://realtyflow.test/api/internal", {
    headers: cookie ? { cookie } : {},
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "api-admin-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  setPlatformSupabaseFactoryForTests(null);
});

test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

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


test("workspace API context revalidates database runtime and live directory", async () => {
  let runtimeEnabled = true;
  let directoryStatus = "active";
  setPlatformSupabaseFactoryForTests(() => ({
    from: (table: string) => {
      assert.equal(table, "brand_settings");
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: { settings: { enabled: runtimeEnabled }, updated_at: null },
          error: null,
        }),
      };
      return query;
    },
    rpc: async (name: string) => {
      assert.equal(name, "workspace_login_directory");
      return {
        data: {
          user_id: "11111111-1111-4111-8111-111111111111",
          username: "staff",
          email: "staff@example.test",
          display_name: "Staff",
          status: directoryStatus,
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient));

  const token = await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const request = requestWithCookie(`realtyflow_admin=${token}`);

  const active = await getRequestAccessContext(request);
  assert.equal(active?.role, "WORKSPACE_MEMBER");
  assert.equal(active?.email, "staff@example.test");

  runtimeEnabled = false;
  assert.equal(await getRequestAccessContext(request), null);

  runtimeEnabled = true;
  directoryStatus = "disabled";
  assert.equal(await getRequestAccessContext(request), null);
});
