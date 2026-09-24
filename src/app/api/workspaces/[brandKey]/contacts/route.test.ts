import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const calls: Array<{ method: string; args: unknown[] }> = [];
let scopedResult: Array<Record<string, unknown>> = [];
function fakeDatabase() {
  const query: any = {
    select(...args: unknown[]) { calls.push({ method: "select", args }); return query; },
    eq(...args: unknown[]) { calls.push({ method: "eq", args }); return query; },
    or(...args: unknown[]) { calls.push({ method: "or", args }); return query; },
    order(...args: unknown[]) { calls.push({ method: "order", args }); return query; },
    range(...args: unknown[]) { calls.push({ method: "range", args }); return query; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: scopedResult, error: null }).then(resolve);
    },
  };
  return {
    rpc(name: string) {
      calls.push({ method: "rpc", args: [name] });
      return Promise.resolve({ data: { brand: { id: "pinoso-uuid", brand_key: "pinosoecolife" }, grant: null }, error: null });
    },
    from(table: string) { calls.push({ method: "from", args: [table] }); return query; },
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
  scopedResult = [{ id: "pinoso-contact", brand_id: "pinosoecolife", name: "Example", email: null }];
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
  assert.equal(payload.contacts[0].id, "pinoso-contact");
  assert.equal(payload.brand, "pinosoecolife");
  assert.deepEqual(calls.filter(c => c.method === "eq"), [
    { method: "eq", args: ["brand_id", "pinosoecolife"] },
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
  scopedResult = Array.from({ length: 51 }, (_, i) => ({ id: `customer-${i}`, brand_id: "pinosoecolife" }));
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
