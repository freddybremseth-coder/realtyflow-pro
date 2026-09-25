import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const calls: Array<{ method: string; args: unknown[] }> = [];
function fakeDatabase() {
  const query: any = {
    select(...args: unknown[]) { calls.push({ method: "select", args }); return query; },
    eq(...args: unknown[]) { calls.push({ method: "eq", args }); return query; },
    order(...args: unknown[]) { calls.push({ method: "order", args }); return query; },
    range(...args: unknown[]) { calls.push({ method: "range", args }); return query; },
    or(...args: unknown[]) { calls.push({ method: "or", args }); return query; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: [{
        id: "published-1", ref: "P-1", title: "Safe property", town: "Pinoso",
        location: "Alicante", price: 365000, bedrooms: 3, bathrooms: 2,
        area_m2: 180, plot_size: 10000, property_type: "villa",
        primary_image: "https://example.test/property.jpg",
        source: "PRIVATE_FEED", status: "internal-review", brand_id: "zeneco",
        commission_amount: 99999, owner_email: "private@example.test",
      }], error: null }).then(resolve);
    },
  };
  return {
    rpc(name: string) {
      calls.push({ method: "rpc", args: [name] });
      return Promise.resolve({ data: { brand: { id: "brand-uuid", brand_key: "pinosoecolife" }, grant: null }, error: null });
    },
    from(table: string) { calls.push({ method: "from", args: [table] }); return query; },
  } as unknown as SupabaseClient;
}
const url = "https://realtyflow.test/api/workspaces/pinosoecolife/properties";
function req(cookie?: string, search = "") {
  return new NextRequest(url + search, { headers: cookie ? { cookie } : {} });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "property-workspace-route-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  calls.length = 0;
  setPlatformSupabaseFactoryForTests(() => fakeDatabase());
});
test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

test("no session is rejected before querying service-role data", async () => {
  const result = await GET(req() as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test("owner catalogue excludes all private columns and requires explicit public visibility", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(req(cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.scope, "published_public_catalogue_owner");
  assert.equal(body.properties[0].id, "published-1");
  assert.deepEqual(Object.keys(body.properties[0]).sort(), [
    "area_m2", "bathrooms", "bedrooms", "id", "location", "plot_size",
    "price", "primary_image", "property_type", "ref", "title", "town",
  ].sort());
  assert.equal(JSON.stringify(body).includes("PRIVATE_FEED"), false);
  assert.equal(JSON.stringify(body).includes("private@example.test"), false);
  assert.equal(JSON.stringify(body).includes("99999"), false);
  const projection = String(calls.find(row => row.method === "select")?.args[0] || "");
  assert.equal(projection.includes("*"), false);
  for (const privateColumn of [
    "commission", "feed_credentials", "owner_email", "notes", "internal_price",
    "source", "status", "brand_id",
  ]) {
    assert.equal(projection.includes(privateColumn), false);
  }
  assert.deepEqual(calls.filter(row => row.method === "eq"), [
    { method: "eq", args: ["show_on_website", true] },
    { method: "eq", args: ["website_visible", true] },
  ]);
});

test("invalid page and overlong search fail closed", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const a = await GET(req(cookie, "?page=-2") as any, { params: { brandKey: "pinosoecolife" } });
  const b = await GET(req(cookie, "?q=" + "a".repeat(81)) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(a.status, 400);
  assert.equal(b.status, 400);
  assert.equal(calls.some(row => row.method === "from"), false);
});

test("search normalizes PostgREST grouping characters before building filter", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(req(cookie, "?q=" + encodeURIComponent("Pinoso),id.eq.hidden")) as any,
    { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 200);
  const filter = String(calls.find(row => row.method === "or")?.args[0] || "");
  assert.equal(filter.includes("id.eq.hidden"), false);
  assert.equal(filter.includes(")"), false);
});


test("search preserves Norwegian and Spanish letters while stripping PostgREST syntax", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const value = "Åsen Málaga),id.eq.private";
  const result = await GET(req(cookie, "?q=" + encodeURIComponent(value)) as any,
    { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 200);
  const filter = String(calls.find(row => row.method === "or")?.args[0] || "");
  assert.equal(filter.includes("Åsen Málaga"), true);
  assert.equal(filter.includes("id.eq.private"), false);
  assert.equal(filter.includes(")"), false);
  // Commas are the route's own fixed OR separators. The user must not be able
  // to inject a close-group + new PostgREST expression such as "),id.eq...".
  assert.equal(filter.includes("),"), false);
  assert.equal((filter.match(/,/g) || []).length, 3);
});


test("workspace member catalogue is exact-brand RPC scoped and never falls back to global properties", async () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    flag: process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED,
    fetch: globalThis.fetch,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-property.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  calls.length = 0;
  let catalogue: unknown = {
    properties: [{
      id: "11111111-1111-4111-8111-111111111111",
      ref: "PIN-101", title: "Pinoso villa", town: "Pinoso", location: "Alicante",
      price: 365000, bedrooms: 3, bathrooms: 2, area_m2: 180, plot_size: 10000,
      property_type: "villa", primary_image: "https://example.test/pinoso.jpg",
      source: "SHOULD_NOT_LEAK", commission_amount: 12345, brand_id: "pinosoecolife",
    }],
    hasMore: false,
  };
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ method: "rpc", args: [name, args] });
      if (name === "workspace_brand_grant") return {
        data: {
          brand: { id: "brand-uuid", brand_key: "pinosoecolife" },
          grant: {
            brand_id: "brand-uuid",
            user_id: "22222222-2222-4222-8222-222222222222",
            email: "staff@example.test",
            status: "active",
            permissions: ["properties.catalog.read"],
          },
        }, error: null,
      };
      if (name === "workspace_brand_property_catalogue") return { data: catalogue, error: null };
      throw new Error("Unexpected RPC " + name);
    },
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      throw new Error("Workspace member must not use direct global property table query");
    },
  } as unknown as SupabaseClient));
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (!String(input).includes("/rest/v1/brand_settings")) throw new Error("Unexpected fetch");
    return new Response(JSON.stringify([{
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const cookie = "realtyflow_admin=" +
      await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
    const response = await GET(req(cookie, "?page=2&q=" + encodeURIComponent("Pinoso),id.eq.hidden")) as any,
      { params: { brandKey: "pinosoecolife" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.scope, "brand_scoped_published_catalogue");
    assert.equal(body.brand, "pinosoecolife");
    assert.equal(body.hasMore, false);
    assert.deepEqual(body.properties.map((item: { id: string }) => item.id),
      ["11111111-1111-4111-8111-111111111111"]);
    assert.equal(JSON.stringify(body).includes("SHOULD_NOT_LEAK"), false);
    assert.equal(JSON.stringify(body).includes("12345"), false);
    const rpcCall = calls.find(row => row.method === "rpc" &&
      row.args[0] === "workspace_brand_property_catalogue");
    assert.deepEqual(rpcCall?.args[1], {
      p_brand_key: "pinosoecolife",
      p_user_id: "22222222-2222-4222-8222-222222222222",
      p_email: "staff@example.test",
      p_offset: 24,
      p_search: "Pinoso id eq hidden",
    });
    assert.equal(calls.some(row => row.method === "from" && row.args[0] === "properties"), false);

    catalogue = null;
    const revoked = await GET(req(cookie) as any, { params: { brandKey: "pinosoecolife" } });
    assert.equal(revoked.status, 403);
    assert.equal((await revoked.json()).error.code, "CATALOGUE_ACCESS_REVOKED");
  } finally {
    globalThis.fetch = previous.fetch;
    setPlatformSupabaseFactoryForTests(null);
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    if (previous.flag === undefined) delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
    else process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = previous.flag;
  }
});
