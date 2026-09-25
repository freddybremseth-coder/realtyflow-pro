import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const endpoint = "https://realtyflow.test/api/workspaces/access-readiness";
const brandId = "11111111-1111-4111-8111-111111111111";
let planPermissions: string[] = ["crm.read", "crm.write", "properties.catalog.read"];
let plansEnabled = true;
let activeGrants: unknown[] = [];
let users: Array<{ id: string; email: string }> = [{ id: "auth-user", email: "staff@example.test" }];
let profiles: unknown[] = [{
  email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true,
  createdAt: "2026-09-25T06:00:00Z", updatedAt: "2026-09-25T06:00:00Z",
}];
let oldFetch: typeof globalThis.fetch;
let oldEnv: Record<string, string | undefined>;

function request(cookie?: string, brandKey = "pinosoecolife", email = "staff@example.test") {
  return new NextRequest(endpoint + "?brandKey=" + encodeURIComponent(brandKey) +
    "&email=" + encodeURIComponent(email), { headers: cookie ? { cookie } : {} });
}

test.beforeEach(() => {
  oldFetch = globalThis.fetch;
  oldEnv = {
    secret: process.env.REALTYFLOW_SESSION_SECRET,
    admins: process.env.REALTYFLOW_ADMIN_EMAILS,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    flag: process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED,
  };
  process.env.REALTYFLOW_SESSION_SECRET = "readiness-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://readiness.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "false";
  planPermissions = ["crm.read", "crm.write", "properties.catalog.read"];
  plansEnabled = true;
  activeGrants = [];
  users = [{ id: "auth-user", email: "staff@example.test" }];
  profiles = [{
    email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true,
    createdAt: "2026-09-25T06:00:00Z", updatedAt: "2026-09-25T06:00:00Z",
  }];

  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => {
      if (name === "workspace_access_snapshot") return {
        data: {
          brands: [{ id: brandId, brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
            { id: "22222222-2222-4222-8222-222222222222", brand_key: "zeneco", display_name: "Zen Eco Homes" }],
          plans: plansEnabled ? [{
            brand_id: brandId, email: "staff@example.test", status: "draft",
            permissions: planPermissions,
          }] : [],
        }, error: null,
      };
      if (name === "workspace_user_brand_grants") return { data: activeGrants, error: null };
      throw new Error("Unexpected RPC " + name);
    },
    auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } },
  } as unknown as SupabaseClient));

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/rest/v1/brand_settings")) throw new Error("Unexpected fetch " + url);
    return new Response(JSON.stringify([{
      settings: { version: 1, profiles, audit: [], updatedAt: "2026-09-25T06:00:00Z" },
      updated_at: "2026-09-25T06:00:00Z",
    }]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

test.afterEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  globalThis.fetch = oldFetch;
  const map: Record<string, string> = {
    secret: "REALTYFLOW_SESSION_SECRET", admins: "REALTYFLOW_ADMIN_EMAILS",
    url: "NEXT_PUBLIC_SUPABASE_URL", key: "SUPABASE_SERVICE_ROLE_KEY",
    flag: "REALTYFLOW_WORKSPACE_MEMBERS_ENABLED",
  };
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[map[key]];
    else process.env[map[key]] = value;
  }
});

test("readiness is owner-only and never acts as an activation endpoint", async () => {
  assert.equal((await GET(request() as any)).status, 401);
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const response = await GET(request(cookie) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.activationAvailable, false);
  assert.equal(body.readyForOwnerReview, true);
  assert.deepEqual(body.blockers, ["FEATURE_FLAG_DISABLED"]);
  assert.equal(body.checks.authUserExists, true);
  assert.deepEqual(body.checks.workspaceProfile, { role: "WORKSPACE_MEMBER", active: true });
  assert.equal(body.checks.activeMembershipExists, false);
});

test("unfinished marketing draft is a blocker rather than an implied staff capability", async () => {
  planPermissions = ["crm.read", "marketing.read", "marketing.draft"];
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const body = await (await GET(request(cookie) as any)).json();
  assert.equal(body.readyForOwnerReview, false);
  assert.equal(body.blockers.includes("MARKETING_SCOPE_NOT_IMPLEMENTED"), true);
  assert.equal(body.activationAvailable, false);
});

test("missing Auth user, profile and draft are explicit blockers without creating anything", async () => {
  users = [];
  profiles = [];
  plansEnabled = false;
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const body = await (await GET(request(cookie) as any)).json();
  for (const blocker of ["NO_DRAFT", "AUTH_USER_MISSING", "ACCESS_PROFILE_MISSING", "FEATURE_FLAG_DISABLED"]) {
    assert.equal(body.blockers.includes(blocker), true, blocker);
  }
  assert.equal(body.draft, null);
  assert.equal(body.activationAvailable, false);
});

test("existing active membership is surfaced as a blocker, never silently overwritten", async () => {
  activeGrants = [{
    brand: { id: brandId, brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
    grant: {
      brand_id: brandId, user_id: "auth-user", email: "staff@example.test",
      status: "active", permissions: ["crm.read"],
    },
  }];
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const body = await (await GET(request(cookie) as any)).json();
  assert.equal(body.blockers.includes("ACTIVE_MEMBERSHIP_ALREADY_PRESENT"), true);
  assert.equal(body.activationAvailable, false);
});

test("Zen draft with generic CRM is rejected by preflight even if stored outside the UI", async () => {
  planPermissions = ["crm.read", "crm.write"];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => {
      if (name === "workspace_access_snapshot") return {
        data: {
          brands: [{ id: brandId, brand_key: "zeneco", display_name: "Zen Eco Homes" }],
          plans: [{ brand_id: brandId, email: "staff@example.test", status: "draft", permissions: planPermissions }],
        }, error: null,
      };
      if (name === "workspace_user_brand_grants") return { data: [], error: null };
      throw new Error("Unexpected RPC");
    },
    auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } },
  } as unknown as SupabaseClient));
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const body = await (await GET(request(cookie, "zeneco") as any)).json();
  assert.equal(body.blockers.includes("INVALID_BRAND_SCOPE"), true);
  assert.equal(body.readyForOwnerReview, false);
});
