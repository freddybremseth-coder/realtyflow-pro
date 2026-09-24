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
      return Promise.resolve({ data: [{ id: "published-1", title: "Safe property" }], error: null }).then(resolve);
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
  assert.equal(body.scope, "published_public_catalogue");
  assert.equal(body.properties[0].id, "published-1");
  const projection = String(calls.find(row => row.method === "select")?.args[0] || "");
  assert.equal(projection.includes("*"), false);
  for (const privateColumn of ["commission", "feed_credentials", "owner_email", "notes", "internal_price"]) {
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
