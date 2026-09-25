import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, POST, PATCH } from "./route";

const contactId = "11111111-1111-4111-8111-111111111111";
const otherContactId = "22222222-2222-4222-8222-222222222222";
const legacyZenId = "33333333-3333-4333-8333-333333333333";

const calls: Array<{ method: string; args: unknown[] }> = [];
let scopedResult: Array<Record<string, unknown>> = [];
let testGrant: Record<string, unknown> | null = null;
function fakeDatabase() {
  const query: any = {
    select(...args: unknown[]) { calls.push({ method: "select", args }); return query; },
    eq(...args: unknown[]) { calls.push({ method: "eq", args }); return query; },
    insert(...args: unknown[]) { calls.push({ method: "insert", args }); return query; },
    update(...args: unknown[]) { calls.push({ method: "update", args }); return query; },
    single() { calls.push({ method: "single", args: [] }); return Promise.resolve({ data: scopedResult[0] || null, error: null }); },
    maybeSingle() { calls.push({ method: "maybeSingle", args: [] }); return Promise.resolve({ data: scopedResult[0] || null, error: null }); },
    or(...args: unknown[]) { calls.push({ method: "or", args }); return query; },
    order(...args: unknown[]) { calls.push({ method: "order", args }); return query; },
    range(...args: unknown[]) { calls.push({ method: "range", args }); return query; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: scopedResult, error: null }).then(resolve);
    },
  };
  return {
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ method: "rpc", args: [name, args] });
      if (name === "workspace_brand_grant") {
        return Promise.resolve({ data: { brand: { id: "pinoso-uuid", brand_key: "pinosoecolife" }, grant: testGrant }, error: null });
      }
      if (name === "workspace_brand_contact_create" || name === "workspace_brand_contact_update") {
        return Promise.resolve({ data: scopedResult[0] || null, error: null });
      }
      throw new Error("Unexpected privileged RPC: " + name);
    },
    from(table: string) { calls.push({ method: "from", args: [table] }); return query; },
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
  } as unknown as SupabaseClient;
}
const base = "https://realtyflow.test/api/workspaces/pinosoecolife/contacts";
const context = { params: { brandKey: "pinosoecolife" } };
function request(cookie?: string, qs = "") {
  return new NextRequest(base + qs, { headers: cookie ? { cookie } : {} });
}
test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-contact-route-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  calls.length = 0;
  testGrant = null;
  scopedResult = [{ id: contactId, brand_id: "pinosoecolife", brand: "pinosoecolife", name: "Example", email: null }];
  setPlatformSupabaseFactoryForTests(() => fakeDatabase());
});
test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

test("unsigned request fails before privileged database access", async () => {
  const result = await GET(request() as any, context);
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test("read is restricted to exact brand at database and never selects internal fields", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(request(cookie) as any, context);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  const payload = await result.json();
  assert.equal(payload.contacts[0].id, contactId);
  assert.equal(payload.brand, "pinosoecolife");
  assert.deepEqual(calls.filter(c => c.method === "eq"), [
    { method: "eq", args: ["brand_id", "pinosoecolife"] },
    { method: "eq", args: ["brand", "pinosoecolife"] },
  ]);
  const select = String(calls.find(c => c.method === "select")?.args[0] || "");
  assert.equal(select.includes("*"), false);
  assert.equal(select.includes("interactions"), false);
  assert.equal(select.includes("notes"), false);
  assert.equal(select.includes("other_brand"), false);
});

test("rejects invalid pagination and overlong search before contact query", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  for (const qs of ["?page=-1", "?page=1001", "?page=1.5", "?q=" + "x".repeat(81)]) {
    calls.length = 0;
    const result = await GET(request(cookie, qs) as any, context);
    assert.equal(result.status, 400, qs);
    assert.equal(calls.some(c => c.method === "from"), false, qs);
  }
});

test("search and pagination remain constrained by exact brand", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(request(cookie, "?q=" + encodeURIComponent("Anna),id.eq.zeneco") + "&page=2") as any, context);
  assert.equal(result.status, 200);
  const or = String(calls.find(c => c.method === "or")?.args[0] || "");
  assert.equal(or.includes("id.eq.zeneco"), false);
  assert.equal(or.includes(")"), false);
  assert.deepEqual(calls.find(c => c.method === "range")?.args, [50, 100]);
  assert.equal(calls.some(c => c.method === "eq" && c.args[0] === "brand_id" && c.args[1] === "pinosoecolife"), true);
});

test("returns a bounded page and hasMore without leaking extra records", async () => {
  scopedResult = Array.from({ length: 51 }, (_, i) => ({ id: `customer-${i}`, brand_id: "pinosoecolife", brand: "pinosoecolife" }));
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(request(cookie) as any, context);
  const body = await result.json();
  assert.equal(body.contacts.length, 50);
  assert.equal(body.hasMore, true);
});

test("search accepts an email domain without allowing a cross-brand query", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(request(cookie, "?q=" + encodeURIComponent("test.user@example.com")) as any, context);
  assert.equal(result.status, 200);
  const filter = String(calls.find(c => c.method === "or")?.args[0] || "");
  assert.equal(filter.includes("test.user@example.com"), true);
  assert.equal(calls.some(c => c.method === "eq" && c.args[0] === "brand_id" && c.args[1] === "pinosoecolife"), true);
});

function mutation(method: "POST" | "PATCH", cookie: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(base, {
    method, headers: { cookie, "content-type": "application/json", origin: "https://realtyflow.test", ...headers },
    body: JSON.stringify(body),
  });
}

test("new scoped customer sets trusted brand and NEW status without looking up cross-brand duplicates", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await POST(mutation("POST", cookie, { name: "Ada", email: "Ada@Example.Test" }) as any, context);
  assert.equal(result.status, 201);
  const inserted = calls.find(c => c.method === "insert")?.args[0] as Record<string, unknown>;
  assert.deepEqual(inserted, {
    name: "Ada", email: "ada@example.test", brand_id: "pinosoecolife", brand: "pinosoecolife", pipeline_status: "NEW",
  });
  assert.equal(calls.some(c => c.method === "upsert" || c.method === "limit"), false);
  assert.equal(calls.some(c => c.method === "select" && c.args[0] === "*"), false);
});

test("new scoped customer refuses user-specified brand, lifecycle, finance, notes and unknown fields", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  for (const payload of [
    { name: "Ada", brand_id: "zeneco" },
    { name: "Ada", pipeline_status: "WON" },
    { name: "Ada", commission_amount: 99999 },
    { name: "Ada", notes: "cross-brand note" },
    { name: "Ada", interactions: [{ to: "other brand" }] },
  ]) {
    const result = await POST(mutation("POST", cookie, payload) as any, context);
    assert.equal(result.status, 400);
  }
  assert.equal(calls.some(c => c.method === "from"), false);
});

test("PATCH enforces both exact id and brand and only changes allowlisted fields", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const response = await PATCH(mutation("PATCH", cookie, { id: contactId, name: "Ada Updated" }) as any, context);
  assert.equal(response.status, 200);
  const updated = calls.find(c => c.method === "update")?.args[0] as Record<string, unknown>;
  assert.equal(updated.name, "Ada Updated");
  assert.equal(typeof updated.updated_at, "string");
  assert.equal(Object.keys(updated).length, 2);
  assert.deepEqual(calls.filter(c => c.method === "eq"), [
    { method: "eq", args: ["id", contactId] },
    { method: "eq", args: ["brand_id", "pinosoecolife"] },
    { method: "eq", args: ["brand", "pinosoecolife"] },
  ]);
});

test("PATCH cannot transfer or modify a different brand or financial/CRM internal columns", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  for (const payload of [
    { id: contactId, brand_id: "zeneco" },
    { id: contactId, name: "Name", pipeline_status: "WON" },
    { id: contactId, commission_amount: 10 },
    { id: contactId, updated_at: "2020-01-01" },
    { id: "../../other", name: "Forged id" },
  ]) {
    const response = await PATCH(mutation("PATCH", cookie, payload) as any, context);
    assert.equal(response.status, 400);
  }
  assert.equal(calls.some(c => c.method === "from"), false);
});

test("PATCH returns 404 when id does not belong to the verified brand", async () => {
  scopedResult = [];
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const response = await PATCH(mutation("PATCH", cookie, { id: otherContactId, name: "Inaccessible" }) as any, context);
  assert.equal(response.status, 404);
  assert.equal(calls.some(c => c.method === "eq" && c.args[0] === "brand_id" && c.args[1] === "pinosoecolife"), true);
});

test("unsafe origin, missing content type and missing user session cannot write", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const crossOrigin = await POST(mutation("POST", cookie, { name: "Ada" }, { origin: "https://evil.example" }) as any, context);
  assert.equal(crossOrigin.status, 403);
  const crossSite = await PATCH(mutation("PATCH", cookie, { id: contactId, name: "Ada" }, { "sec-fetch-site": "cross-site" }) as any, context);
  assert.equal(crossSite.status, 403);
  const unsigned = await POST(mutation("POST", "", { name: "Ada" }) as any, context);
  assert.equal(unsigned.status, 401);
  assert.equal(calls.some(c => c.method === "from"), false);
});

test("read-only brand member can search Pinoso CRM but cannot write or select another brand", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFlag = process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  const fetchBefore = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "scoped-workspace-test-service-key";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  testGrant = {
    brand_id: "pinoso-uuid", user_id: "verified-user", email: "staff@example.test",
    status: "active", permissions: ["crm.read"],
  };
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (!String(url).includes("/rest/v1/brand_settings")) throw new Error("unexpected external request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const cookie = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
    const readable = await GET(request(cookie) as any, context);
    assert.equal(readable.status, 200);
    const callsBeforeWrite = calls.filter(c => c.method === "from").length;
    const forbidden = await POST(mutation("POST", cookie, { name: "Forbidden write" }) as any, context);
    assert.equal(forbidden.status, 403);
    const forbiddenEdit = await PATCH(mutation("PATCH", cookie, { id: contactId, name: "Forbidden edit" }) as any, context);
    assert.equal(forbiddenEdit.status, 403);
    assert.equal(calls.filter(c => c.method === "from").length, callsBeforeWrite);
    const crossBrand = await GET(request(cookie) as any, { params: { brandKey: "zeneco" } });
    assert.equal(crossBrand.status, 403); // Zen new-lead cohort guard fails before legacy CRM lookup
    const crossBrandPost = await POST(mutation("POST", cookie, { name: "No Zen legacy write" }) as any,
      { params: { brandKey: "zeneco" } });
    assert.equal(crossBrandPost.status, 403);
    const crossBrandPatch = await PATCH(mutation("PATCH", cookie, { id: legacyZenId, name: "No Zen legacy edit" }) as any,
      { params: { brandKey: "zeneco" } });
    assert.equal(crossBrandPatch.status, 403);
    assert.equal(calls.filter(c => c.method === "from").length, callsBeforeWrite);
  } finally {
    globalThis.fetch = fetchBefore;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousFlag === undefined) delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
    else process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = previousFlag;
  }
});

test("writable Pinoso member uses atomic RPCs and never performs direct service-role contact insert/update", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFlag = process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  const fetchBefore = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "scoped-workspace-test-service-key";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  testGrant = {
    brand_id: "pinoso-uuid", user_id: "verified-user", email: "staff@example.test",
    status: "active", permissions: ["crm.read", "crm.write"],
  };
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (!String(url).includes("/rest/v1/brand_settings")) throw new Error("unexpected external request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const cookie = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
    scopedResult = [{
      id: contactId, brand_id: "pinosoecolife", brand: "pinosoecolife",
      name: "Ada", email: "ada@example.test", phone: null, pipeline_status: "NEW",
      source: "manual", updated_at: "2026-09-25T06:00:00Z",
    }];
    const created = await POST(mutation("POST", cookie, { name: "Ada", email: "Ada@Example.Test" }) as any, context);
    assert.equal(created.status, 201);
    const createCall = calls.find(c => c.method === "rpc" && c.args[0] === "workspace_brand_contact_create");
    assert.ok(createCall);
    assert.deepEqual((createCall?.args[1] as Record<string, unknown>), {
      p_brand_key: "pinosoecolife", p_user_id: "verified-user", p_email: "staff@example.test",
      p_name: "Ada", p_contact_email: "ada@example.test", p_phone: null,
    });
    assert.equal(calls.some(c => c.method === "insert"), false);

    scopedResult = [{ ...scopedResult[0], name: "Ada Updated" }];
    const updated = await PATCH(mutation("PATCH", cookie, { id: contactId, name: "Ada Updated" }) as any, context);
    assert.equal(updated.status, 200);
    const updateCall = calls.find(c => c.method === "rpc" && c.args[0] === "workspace_brand_contact_update");
    assert.ok(updateCall);
    const args = updateCall?.args[1] as Record<string, unknown>;
    assert.equal(args.p_brand_key, "pinosoecolife");
    assert.equal(args.p_contact_id, contactId);
    assert.equal(args.p_set_name, true);
    assert.equal(args.p_set_email, false);
    assert.equal(args.p_set_phone, false);
    assert.equal(calls.some(c => c.method === "update"), false);

    scopedResult = [];
    const revokedOrMissing = await PATCH(mutation("PATCH", cookie, { id: contactId, phone: "+34 600 000 000" }) as any, context);
    assert.equal(revokedOrMissing.status, 404);
  } finally {
    globalThis.fetch = fetchBefore;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousFlag === undefined) delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
    else process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = previousFlag;
  }
});

test("response never serializes a row with conflicting legacy brand tags", async () => {
  scopedResult = [
    { id: "pinoso-ok", brand_id: "pinosoecolife", brand: "pinosoecolife", name: "Safe" },
    { id: "other-legacy", brand_id: "pinosoecolife", brand: "zenecohomes", name: "PRIVATE CUSTOMER", email: "hidden@example.test" },
    { id: "other-id", brand_id: "zenecohomes", brand: "pinosoecolife", name: "PRIVATE CUSTOMER" },
    { id: "unassigned-legacy", brand_id: "pinosoecolife", name: "PRIVATE CUSTOMER" },
  ];
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const response = await GET(request(cookie) as any, context);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.contacts.map((item: { id: string }) => item.id), ["pinoso-ok"]);
  assert.equal(JSON.stringify(body).includes("PRIVATE CUSTOMER"), false);
  assert.equal(JSON.stringify(body).includes("hidden@example.test"), false);
  assert.equal(calls.some(row => row.method === "eq" && row.args[0] === "brand"), true);
});
