import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const calls: string[] = [];
test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-capabilities-test";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  calls.length = 0;
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: (method: string) => {
      calls.push(method);
      return Promise.resolve({
        data: { brand: { id: "brand-1", brand_key: "pinosoecolife" }, grant: null }, error: null,
      });
    },
  } as unknown as SupabaseClient));
});
test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

const request = (cookie?: string) => new NextRequest(
  "https://realtyflow.test/api/workspaces/pinosoecolife/capabilities",
  { headers: cookie ? { cookie } : {} },
);

test("capabilities denies unsigned sessions without touching database", async () => {
  const result = await GET(request() as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 401);
  assert.deepEqual(calls, []);
});

test("owner capabilities use service-only scope lookup without requiring employee grant", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(request(cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.brand, "pinosoecolife");
  assert.equal(body.permissions.includes("crm.read"), true);
  assert.equal(body.permissions.includes("properties.catalog.read"), true);
  assert.deepEqual(calls, ["workspace_brand_grant"]);
});

test("requested brand must be canonical and exactly match verified scope", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const malformed = await GET(request(cookie) as any, { params: { brandKey: "zeneco, pinosoecolife" } });
  assert.equal(malformed.status, 404);
  assert.deepEqual(calls, []);
  const wrongBrand = await GET(request(cookie) as any, { params: { brandKey: "zeneco" } });
  assert.equal(wrongBrand.status, 404);
  assert.deepEqual(calls, ["workspace_brand_grant"]);
});

test("Zen Eco member capability response never advertises brand-wide CRM for historical customers", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFlag = process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  const permitted = ["crm.read", "crm.write", "properties.catalog.read"];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async () => ({
      data: { brand: { id: "zeneco-uuid", brand_key: "zeneco" },
        grant: { brand_id: "zeneco-uuid", user_id: "staff-id", email: "staff@example.test", status: "active", permissions: permitted } },
      error: null,
    }),
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
  } as unknown as SupabaseClient));
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (!String(url).includes("/rest/v1/brand_settings")) throw new Error("Unexpected request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const cookie = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
    const response = await GET(request(cookie) as any, { params: { brandKey: "zeneco" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.permissions, ["properties.catalog.read"]);
    assert.equal(JSON.stringify(body).includes("crm.read"), false);
    assert.equal(JSON.stringify(body).includes("crm.write"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    if (oldFlag === undefined) delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
    else process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = oldFlag;
  }
});

test("Zen joint-write is not advertised without joint-read; Pinoso cannot advertise joint grants", async () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    flag: process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED,
    fetch: globalThis.fetch,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  let currentBrand = "zeneco";
  let currentPermissions = ["crm.joint.write", "properties.catalog.read"];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async () => ({
      data: { brand: { id: "brand-id", brand_key: currentBrand },
        grant: { brand_id: "brand-id", user_id: "staff-id", email: "staff@example.test",
          status: "active", permissions: currentPermissions } }, error: null,
    }),
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
  } as unknown as SupabaseClient));
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (!String(url).includes("/rest/v1/brand_settings")) throw new Error("Unexpected request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const signed = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
    const scoped = await GET(request(signed) as any, { params: { brandKey: "zeneco" } });
    assert.equal(scoped.status, 200);
    assert.deepEqual((await scoped.json()).permissions, ["properties.catalog.read"]);

    currentPermissions = ["crm.joint.read", "crm.joint.write", "crm.read", "crm.write", "tasks.joint.write"];
    const joint = await GET(request(signed) as any, { params: { brandKey: "zeneco" } });
    assert.equal(joint.status, 200);
    assert.deepEqual((await joint.json()).permissions, ["crm.joint.read", "crm.joint.write"]);
    currentPermissions = ["crm.joint.read", "tasks.joint.read", "tasks.joint.write"];
    const taskScope = await GET(request(signed) as any, { params: { brandKey: "zeneco" } });
    assert.equal(taskScope.status, 200);
    assert.deepEqual((await taskScope.json()).permissions,
      ["crm.joint.read", "tasks.joint.read", "tasks.joint.write"]);

    currentBrand = "pinosoecolife";
    currentPermissions = ["crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write",
      "properties.catalog.read", "marketing.read", "marketing.draft", "marketing.publish"];
    const otherBrand = await GET(request(signed) as any, { params: { brandKey: "pinosoecolife" } });
    assert.equal(otherBrand.status, 200);
    assert.deepEqual((await otherBrand.json()).permissions, ["properties.catalog.read"]);
    assert.equal(JSON.stringify(await GET(request(signed) as any,
      { params: { brandKey: "pinosoecolife" } })).includes("marketing."), false);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [
      ["NEXT_PUBLIC_SUPABASE_URL", previous.url],
      ["SUPABASE_SERVICE_ROLE_KEY", previous.key],
      ["REALTYFLOW_WORKSPACE_MEMBERS_ENABLED", previous.flag],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
