import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
let permissions: string[] = [];
let currentBrand = "pinosoecolife";
let previous: Record<string, string | undefined>;
let previousFetch: typeof globalThis.fetch;

const request = (cookie: string) => new NextRequest(
  "https://realtyflow.test/api/workspaces/available",
  { headers: { cookie } },
);

test.beforeEach(() => {
  previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    flag: process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED,
    secret: process.env.REALTYFLOW_SESSION_SECRET,
    admins: process.env.REALTYFLOW_ADMIN_EMAILS,
  };
  previousFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-list.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  process.env.REALTYFLOW_SESSION_SECRET = "available-route-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  permissions = [];
  currentBrand = "pinosoecolife";

  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => {
      assert.equal(name, "workspace_user_brand_grants");
      return {
        data: [{
          brand: { id: "brand-id", brand_key: currentBrand, display_name:
            currentBrand === "zeneco" ? "Zen Eco Homes" : "Pinoso EcoLife" },
          grant: {
            brand_id: "brand-id", user_id: userId, email: "staff@example.test",
            status: "active", permissions,
          },
        }],
        error: null,
      };
    },
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
});

test.afterEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  globalThis.fetch = previousFetch;
  for (const [key, value] of Object.entries(previous)) {
    const envKey = ({
      url: "NEXT_PUBLIC_SUPABASE_URL",
      key: "SUPABASE_SERVICE_ROLE_KEY",
      flag: "REALTYFLOW_WORKSPACE_MEMBERS_ENABLED",
      secret: "REALTYFLOW_SESSION_SECRET",
      admins: "REALTYFLOW_ADMIN_EMAILS",
    } as Record<string, string>)[key];
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

test("marketing-only Pinoso membership is not advertised as an available workspace", async () => {
  permissions = ["marketing.read", "marketing.draft", "marketing.publish"];
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await GET(request(cookie) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.workspaces, []);
});

test("implemented Pinoso permission is shown while unfinished marketing rights stay hidden", async () => {
  permissions = ["properties.catalog.read", "marketing.read", "marketing.draft"];
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await GET(request(cookie) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.workspaces, [{
    brandKey: "pinosoecolife", name: "Pinoso EcoLife",
    permissions: ["properties.catalog.read"],
  }]);
  assert.equal(JSON.stringify(body).includes("marketing."), false);
});

test("Zen available workspace never inherits generic CRM or unfinished marketing rights", async () => {
  currentBrand = "zeneco";
  permissions = ["crm.read", "crm.write", "crm.joint.read", "properties.catalog.read",
    "marketing.read", "marketing.publish"];
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await GET(request(cookie) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.workspaces[0].permissions,
    ["crm.joint.read", "properties.catalog.read"]);
  assert.equal(JSON.stringify(body).includes("crm.write"), false);
  assert.equal(JSON.stringify(body).includes("marketing."), false);
});
