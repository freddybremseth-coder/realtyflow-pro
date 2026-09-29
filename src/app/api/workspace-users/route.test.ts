import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, POST } from "./route";

const endpoint = "https://realtyflow.test/api/workspace-users";
const userId = "11111111-1111-4111-8111-111111111111";
let rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
let authCalls: Array<{ method: string; args: unknown[] }> = [];
let snapshot: unknown;
let runtimeEnabled = false;
let runtimeWrites: unknown[] = [];
let preflightSafe = true;

function req(method: string, cookie?: string, body?: unknown, headers: Record<string,string> = {}) {
  return new NextRequest(endpoint, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-user-route-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "false";
  rpcCalls = [];
  authCalls = [];
  runtimeEnabled = false;
  runtimeWrites = [];
  preflightSafe = true;
  snapshot = {
    users: [],
    brands: [
      { id: "brand-pinoso", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
      { id: "brand-zen", brand_key: "zeneco", display_name: "Zen Eco Homes" },
    ],
  };
  setPlatformSupabaseFactoryForTests(() => ({
    from: (table: string) => {
      assert.equal(table, "brand_settings");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { settings: { enabled: runtimeEnabled }, updated_at: null },
              error: null,
            }),
          }),
        }),
        upsert: async (row: any) => {
          runtimeWrites.push(row);
          runtimeEnabled = row?.settings?.enabled === true;
          return { error: null };
        },
      };
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "workspace_user_admin_snapshot") return { data: snapshot, error: null };
      if (name === "workspace_staff_security_preflight") {
        return { data: { safe_for_workspace_auth: preflightSafe }, error: null };
      }
      if (name === "workspace_user_configure_v2") return { data: true, error: null };
      if (name === "workspace_user_disable") return { data: true, error: null };
      throw new Error("Unexpected RPC " + name);
    },
    auth: { admin: {
      inviteUserByEmail: async (...args: unknown[]) => {
        authCalls.push({ method: "inviteUserByEmail", args });
        return { data: { user: { id: userId, email: "andrea@example.test" } }, error: null };
      },
      deleteUser: async (...args: unknown[]) => {
        authCalls.push({ method: "deleteUser", args });
        return { data: {}, error: null };
      },
      getUserById: async (...args: unknown[]) => {
        authCalls.push({ method: "getUserById", args });
        return { data: { user: { id: userId, email: "andrea@example.test" } }, error: null };
      },
      updateUserById: async (...args: unknown[]) => {
        authCalls.push({ method: "updateUserById", args });
        return { data: { user: { id: userId, email: "andrea@example.test" } }, error: null };
      },
    } },
  } as unknown as SupabaseClient));
});

test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

test("workspace user administration is owner-only and same-origin for writes", async () => {
  assert.equal((await GET(req("GET") as any)).status, 401);
  const owner = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const forged = await POST(req("POST", owner, { action: "CREATE_USER" }, {
    origin: "https://evil.example.test",
  }) as any);
  assert.equal(forged.status, 403);
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(authCalls, []);
});

test("owner snapshot exposes brands/users but never password storage", async () => {
  const owner = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const response = await GET(req("GET", owner) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.passwordStorage, "supabase-auth-only");
  assert.equal(body.featureEnabled, false);
  assert.equal(JSON.stringify(body).toLowerCase().includes("password_hash"), false);
});

test("owner can enable database-backed workspace login only after green security preflight", async () => {
  const owner = "realtyflow_admin=" + await createAdminSession("owner@example.test");

  preflightSafe = false;
  const blocked = await POST(req("POST", owner, {
    action: "SET_LOGIN_ENABLED", enabled: true,
  }) as any);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, "WORKSPACE_SECURITY_PREFLIGHT_FAILED");
  assert.equal(runtimeEnabled, false);
  assert.equal(runtimeWrites.length, 0);

  preflightSafe = true;
  const enabled = await POST(req("POST", owner, {
    action: "SET_LOGIN_ENABLED", enabled: true,
  }) as any);
  assert.equal(enabled.status, 200);
  assert.equal((await enabled.json()).featureEnabled, true);
  assert.equal(runtimeEnabled, true);
  assert.equal(runtimeWrites.length, 1);

  const disabled = await POST(req("POST", owner, {
    action: "SET_LOGIN_ENABLED", enabled: false,
  }) as any);
  assert.equal(disabled.status, 200);
  assert.equal((await disabled.json()).featureEnabled, false);
  assert.equal(runtimeEnabled, false);
});

test("create user sends a self-service invite and configures safe multi-brand permissions", async () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://realtyflow.test";
  const owner = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const response = await POST(req("POST", owner, {
    action: "CREATE_USER",
    username: "andrea",
    email: "andrea@example.test",
    displayName: "Andrea",
    accountKind: "external",
    organization: "Search Partner AS",
    accessExpiresAt: "2027-03-31T21:59:59.000Z",
    brandAccess: [
      { brandKey: "pinosoecolife", permissions: ["crm.read","crm.write","properties.catalog.read"] },
      { brandKey: "zeneco", permissions: ["crm.joint.read","tasks.joint.read","properties.catalog.read"] },
    ],
  }) as any);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.passwordStoredInRealtyFlow, false);
  assert.equal(body.inviteSent, true);
  assert.equal(body.loginEnabled, false);
  const invite = authCalls.find(call => call.method === "inviteUserByEmail");
  assert.equal(invite?.args[0], "andrea@example.test");
  assert.equal((invite?.args[1] as any).redirectTo, "https://realtyflow.test/reset-password?flow=workspace-invite");
  assert.equal((invite?.args[1] as any).data.account_type, "realtyflow_workspace");
  const configure = rpcCalls.find(call => call.name === "workspace_user_configure_v2");
  assert.ok(configure);
  assert.equal(configure?.args?.p_username, "andrea");
  assert.equal(configure?.args?.p_account_kind, "external");
  assert.equal(configure?.args?.p_organization, "Search Partner AS");
  assert.equal(configure?.args?.p_access_expires_at, "2027-03-31T21:59:59.000Z");
});

test("invalid workspace-user input returns the exact field before Auth mutation", async () => {
  const owner = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const cases = [
    {
      body: {
        action: "CREATE_USER", username: "an", email: "andrea@example.test",
        displayName: "Andrea",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["crm.read"] }],
      },
      error: "INVALID_USERNAME", field: "username",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "not-an-email",
        displayName: "Andrea",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["crm.read"] }],
      },
      error: "INVALID_EMAIL", field: "email",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea",
        brandAccess: [{ brandKey: "zeneco", permissions: ["crm.read"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["marketing.draft"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["marketing.publish"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["marketing.read","marketing.publish"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["content.edit"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["content.read","content.publish"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["email.draft"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["email.read","email.send"] }],
      },
      error: "INVALID_BRAND_ACCESS", field: "brandAccess",
    },
  ];
  cases.push(
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        accountKind: "vendor",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["crm.read"] }],
      },
      error: "INVALID_ACCOUNT_KIND", field: "accountKind",
    },
    {
      body: {
        action: "CREATE_USER", username: "andrea", email: "andrea@example.test",
        displayName: "Andrea", password: "Strong!Workspace7Password",
        accountKind: "external", accessExpiresAt: "not-a-date",
        brandAccess: [{ brandKey: "pinosoecolife", permissions: ["crm.read"] }],
      },
      error: "INVALID_ACCESS_EXPIRY", field: "accessExpiresAt",
    },
  );

  for (const testCase of cases) {
    const response = await POST(req("POST", owner, testCase.body) as any);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, testCase.error);
    assert.equal(body.field, testCase.field);
    assert.equal(typeof body.message, "string");
    assert.ok(body.message.length > 0);
  }
  assert.equal(authCalls.length, 0);
});

test("existing managed user can update access, reset password and disable without password persistence", async () => {
  snapshot = {
    users: [{
      user_id: userId, username: "andrea", email: "andrea@example.test",
      display_name: "Andrea", status: "active", account_kind: "external",
      organization: "Search Partner AS", access_expires_at: null, expired: false,
      created_at: null, updated_at: null, memberships: [],
    }],
    brands: [{ id: "brand-pinoso", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" }],
  };
  const owner = "realtyflow_admin=" + await createAdminSession("owner@example.test");

  const updated = await POST(req("POST", owner, {
    action: "UPDATE_ACCESS", userId, username: "andrea", displayName: "Andrea T.",
    accountKind: "external", organization: "Search Partner AS", accessExpiresAt: "2027-04-30T21:59:59.000Z",
    brandAccess: [{ brandKey: "pinosoecolife", permissions: ["crm.read","properties.catalog.read","marketing.read","marketing.draft","marketing.publish","content.read","content.edit","content.publish","email.read","email.draft","email.send"] }],
  }) as any);
  assert.equal(updated.status, 200);
  const updateConfigure = rpcCalls.find(call => call.name === "workspace_user_configure_v2");
  assert.ok(updateConfigure);
  assert.equal(updateConfigure?.args?.p_account_kind, "external");
  assert.equal(updateConfigure?.args?.p_access_expires_at, "2027-04-30T21:59:59.000Z");

  const cleared = await POST(req("POST", owner, {
    action: "UPDATE_ACCESS", userId, username: "andrea", displayName: "Andrea T.",
    accountKind: "staff", organization: null, accessExpiresAt: null,
    brandAccess: [{ brandKey: "pinosoecolife", permissions: ["crm.read","properties.catalog.read"] }],
  }) as any);
  assert.equal(cleared.status, 200);
  const clearConfigure = rpcCalls.filter(call => call.name === "workspace_user_configure_v2").at(-1);
  assert.equal(clearConfigure?.args?.p_account_kind, "staff");
  assert.equal(clearConfigure?.args?.p_organization, null);
  assert.equal(clearConfigure?.args?.p_access_expires_at, null);

  const password = "Another!Strong8Password";
  const reset = await POST(req("POST", owner, {
    action: "SET_PASSWORD", userId, password,
  }) as any);
  assert.equal(reset.status, 200);
  assert.equal((authCalls.find(call => call.method === "updateUserById")?.args[1] as any).password, password);
  assert.equal(JSON.stringify(rpcCalls).includes(password), false);

  const disabled = await POST(req("POST", owner, { action: "DISABLE_USER", userId }) as any);
  assert.equal(disabled.status, 200);
  assert.ok(rpcCalls.some(call => call.name === "workspace_user_disable"));
});
