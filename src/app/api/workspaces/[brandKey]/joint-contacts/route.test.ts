import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const brandId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
let permissions = ["crm.joint.read"];
let returnedContacts: Array<Record<string, unknown>> = [];
const endpoint = "https://realtyflow.test/api/workspaces/zeneco/joint-contacts";
function req(cookie?: string, query = "") {
  return new NextRequest(endpoint + query, { headers: cookie ? { cookie } : {} });
}
test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "zen-joint-contacts-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  calls.length = 0;
  permissions = ["crm.joint.read"];
  returnedContacts = [{ id: "33333333-3333-4333-8333-333333333333", brand_id: "zeneco", brand: "zeneco",
    name: "New joint client", email: "new@example.test", phone: "+34000000000",
    pipeline_status: "NEW", created_at: "2026-09-24T11:00:00Z", updated_at: "2026-09-24T11:00:00Z" }];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "workspace_brand_grant") return {
        data: { brand: { id: brandId, brand_key: "zeneco" },
          grant: { brand_id: brandId, user_id: memberId, email: "staff@example.test",
            status: "active", permissions } }, error: null,
      };
      if (name === "workspace_zeneco_joint_contacts") return {
        data: { contacts: returnedContacts, hasMore: false }, error: null,
      };
      throw new Error("unexpected privileged RPC");
    },
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
  } as unknown as SupabaseClient));
});
const previousFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = previousFetch;
  setPlatformSupabaseFactoryForTests(null);
  delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
function liveProfile() {
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (!String(url).includes("/rest/v1/brand_settings")) throw new Error("unexpected external request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("unsigned requests and other-brand URL never run any privileged RPC", async () => {
  assert.equal((await GET(req() as any, { params: { brandKey: "zeneco" } })).status, 401);
  assert.equal((await GET(req() as any, { params: { brandKey: "soleada" } })).status, 404);
  assert.deepEqual(calls, []);
});

test("a member granted only full-brand CRM cannot bypass the explicit joint-read grant", async () => {
  liveProfile();
  permissions = ["crm.read"];
  const token = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
  const response = await GET(req(token) as any, { params: { brandKey: "zeneco" } });
  assert.equal(response.status, 403);
  assert.equal(calls.some(call => call.name === "workspace_zeneco_joint_contacts"), false);
});

test("staff query uses verified Auth UUID and session email, never URL parameters or guessed IDs", async () => {
  liveProfile();
  const token = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
  const response = await GET(req(token, "?page=2&q=" + encodeURIComponent("Ada,other.brand")) as any,
    { params: { brandKey: "zeneco" } });
  assert.equal(response.status, 200);
  const query = calls.find(call => call.name === "workspace_zeneco_joint_contacts");
  assert.ok(query);
  assert.deepEqual(query.args, {
    p_user_id: memberId,
    p_email: "staff@example.test",
    p_offset: 50,
    p_search: "Ada,other.brand",
  });
  const body = await response.json();
  assert.equal(body.brand, "zeneco");
  assert.equal(body.contacts.length, 1);
  assert.equal(JSON.stringify(body).includes("notes"), false);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("mixed response cannot serialize historical, cross-brand or internal fields even from a broken RPC", async () => {
  liveProfile();
  returnedContacts.push(
    { id: "44444444-4444-4444-8444-444444444444", brand_id: "soleada", brand: "soleada",
      created_at: "2026-09-24T11:00:00Z", name: "PRIVATE SOLEADA", email: "secret@example.test" },
    { id: "55555555-5555-4555-8555-555555555555", brand_id: "zeneco", brand: "zeneco",
      created_at: "2026-09-21T11:00:00Z", name: "PRIVATE HISTORICAL ZEN" },
  );
  returnedContacts[0].notes = "PRIVATE FINANCIAL NOTES";
  const token = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
  const result = await GET(req(token) as any, { params: { brandKey: "zeneco" } });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.contacts.map((row: { name: string }) => row.name), ["New joint client"]);
  assert.equal(JSON.stringify(body).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(body).includes("secret@example.test"), false);
});

test("flag shutdown, invalid pagination and missing cohort migration fail closed", async () => {
  liveProfile();
  const token = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
  assert.equal((await GET(req(token, "?page=0") as any, { params: { brandKey: "zeneco" } })).status, 400);
  assert.equal((await GET(req(token, "?q=" + "x".repeat(81)) as any, { params: { brandKey: "zeneco" } })).status, 400);
  assert.equal(calls.some(call => call.name === "workspace_zeneco_joint_contacts"), false);
  delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  assert.equal((await GET(req(token) as any, { params: { brandKey: "zeneco" } })).status, 401);
});
