import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const calls: Array<{ table?: string; method: string; args: unknown[] }> = [];
let permissions: string[] = ["marketing.read", "marketing.draft"];
let publications: Array<Record<string, unknown>> = [];
let channels: Array<Record<string, unknown>> = [];

function fakeDatabase() {
  function builder(table: string) {
    let rows = table === "content_publications" ? publications : channels;
    let inserted: Record<string, unknown> | null = null;
    const query: any = {
      select(...args: unknown[]) { calls.push({ table, method: "select", args }); return query; },
      eq(column: string, value: unknown) {
        calls.push({ table, method: "eq", args: [column, value] });
        rows = rows.filter(row => row[column] === value);
        return query;
      },
      in(column: string, values: unknown[]) {
        calls.push({ table, method: "in", args: [column, values] });
        rows = rows.filter(row => values.includes(row[column]));
        return query;
      },
      order(...args: unknown[]) { calls.push({ table, method: "order", args }); return query; },
      limit(...args: unknown[]) { calls.push({ table, method: "limit", args }); return query; },
      insert(value: Record<string, unknown>) {
        calls.push({ table, method: "insert", args: [value] });
        inserted = {
          id: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-09-27T12:00:00Z",
          updated_at: "2026-09-27T12:00:00Z",
          total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0,
          thumbnail_url: null, scheduled_at: null, published_at: null,
          ...value,
        };
        return query;
      },
      single() {
        calls.push({ table, method: "single", args: [] });
        return Promise.resolve({ data: inserted, error: null });
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  }

  return {
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ method: "rpc", args: [name, args] });
      if (name !== "workspace_brand_grant") throw new Error("Unexpected RPC " + name);
      const key = String(args?.p_brand_key || "");
      return Promise.resolve({
        data: {
          brand: { id: key === "zeneco" ? "zen-id" : "pinoso-id", brand_key: key },
          grant: key === "pinosoecolife" ? {
            brand_id: "pinoso-id", user_id: userId, email: "staff@example.test",
            status: "active", permissions,
          } : null,
        },
        error: null,
      });
    },
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      if (!["content_publications", "social_channels"].includes(table)) {
        throw new Error("Unexpected table " + table);
      }
      return builder(table);
    },
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
  } as unknown as SupabaseClient;
}

const base = "https://realtyflow.test/api/workspaces/pinosoecolife/marketing";
function request(cookie?: string, method = "GET", body?: unknown) {
  return new NextRequest(base, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : {
        "content-type": "application/json",
        origin: "https://realtyflow.test",
      }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let oldFetch: typeof fetch;
test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "marketing-workspace-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "workspace-service-key";
  calls.length = 0;
  permissions = ["marketing.read", "marketing.draft"];
  publications = [{
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    brand_id: "pinosoecolife", content_type: "social",
    title: "Pinoso draft", description: "Brand-safe content", tags: ["pinoso"],
    thumbnail_url: null, scheduled_platforms: ["instagram"], status: "draft",
    scheduled_at: null, published_at: null,
    created_at: "2026-09-27T10:00:00Z", updated_at: "2026-09-27T10:00:00Z",
    total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0,
  }, {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    brand_id: "zeneco", content_type: "social",
    title: "PRIVATE ZEN", description: "Must not leak", tags: [],
    thumbnail_url: null, scheduled_platforms: ["facebook"], status: "published",
    scheduled_at: null, published_at: "2026-09-26T10:00:00Z",
    created_at: "2026-09-25T10:00:00Z", updated_at: "2026-09-26T10:00:00Z",
    total_views: 10, total_likes: 1, total_comments: 0, total_shares: 0,
  }];
  channels = [
    { brand_id: "pinosoecolife", platform: "facebook", display_name: "Pinoso Facebook", is_active: true },
    { brand_id: "pinosoecolife", platform: "instagram", display_name: "Pinoso Instagram", is_active: true },
    { brand_id: "zeneco", platform: "facebook", display_name: "Zen Facebook", is_active: true },
  ];
  setPlatformSupabaseFactoryForTests(() => fakeDatabase());
  oldFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (!String(url).includes("/rest/v1/brand_settings")) throw new Error("Unexpected external request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

test.afterEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  globalThis.fetch = oldFetch;
});

test("marketing read is exact-brand and never exposes channel identifiers or other brands", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await GET(request(cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.publications.map((row: any) => row.title), ["Pinoso draft"]);
  assert.equal(JSON.stringify(body).includes("PRIVATE ZEN"), false);
  assert.deepEqual(body.channels.map((row: any) => row.platform), ["facebook", "instagram"]);
  assert.equal(JSON.stringify(body).includes("external_id"), false);
  assert.equal(calls.some(call => call.table === "content_publications" &&
    call.method === "eq" && call.args[0] === "brand_id" && call.args[1] === "pinosoecolife"), true);
  assert.equal(calls.some(call => call.table === "social_channels" &&
    call.method === "eq" && call.args[0] === "brand_id" && call.args[1] === "pinosoecolife"), true);
});

test("marketing draft write is brand-fixed and cannot publish", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await POST(request(cookie, "POST", {
    title: "Ny Pinoso post",
    description: "Et trygt utkast for Pinoso EcoLife.",
    tags: ["Pinoso", "Villa"],
    platforms: ["facebook", "instagram"],
    status: "published",
    brand_id: "zeneco",
  }) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.published, false);
  const insert = calls.find(call => call.table === "content_publications" && call.method === "insert")?.args[0] as any;
  assert.equal(insert.brand_id, "pinosoecolife");
  assert.equal(insert.status, "draft");
  assert.equal(insert.content_type, "social");
  assert.equal(insert.description, "Et trygt utkast for Pinoso EcoLife.");
  assert.deepEqual(insert.tags, ["pinoso", "villa"]);
  assert.equal(JSON.stringify(insert).includes("zeneco"), false);
});

test("marketing draft requires explicit draft permission and active brand channel", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  permissions = ["marketing.read"];
  const denied = await POST(request(cookie, "POST", {
    description: "No write permission",
  }) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(denied.status, 403);

  permissions = ["marketing.read", "marketing.draft"];
  const badChannel = await POST(request(cookie, "POST", {
    description: "Draft with inactive destination",
    platforms: ["youtube"],
  }) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(badChannel.status, 409);
  assert.equal(calls.filter(call => call.table === "content_publications" && call.method === "insert").length, 0);
});

test("other-brand workspace is denied before marketing table access", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  calls.length = 0;
  const response = await GET(request(cookie) as any, { params: { brandKey: "zeneco" } });
  assert.equal(response.status, 403);
  assert.equal(calls.some(call => call.method === "from"), false);
});
