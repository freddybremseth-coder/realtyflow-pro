import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, PATCH, POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const calls: Array<{ table?: string; method: string; args: unknown[] }> = [];
let permissions: string[] = ["marketing.read", "marketing.draft"];
let publications: Array<Record<string, unknown>> = [];
let channels: Array<Record<string, unknown>> = [];

function fakeDatabase() {
  return {
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ method: "rpc", args: [name, args] });
      if (name === "workspace_brand_grant") {
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
      }
      if (name === "workspace_brand_marketing_snapshot") {
        return Promise.resolve({
          data: {
            publications: publications.filter(row => row.brand_id === args?.p_brand_key),
            channels: channels.filter(row => row.brand_id === args?.p_brand_key && row.is_active === true),
          },
          error: null,
        });
      }
      if (name === "workspace_brand_marketing_publish_queue") {
        const publication = publications.find(row =>
          row.id === args?.p_publication_id && row.brand_id === args?.p_brand_key);
        const requested = Array.isArray(args?.p_platforms) ? args?.p_platforms as string[] : [];
        if (!publication || !["draft", "failed"].includes(String(publication.status))) {
          return Promise.resolve({ data: { ok: false, error: "PUBLICATION_NOT_PUBLISHABLE" }, error: null });
        }
        const active = channels.filter(row => row.brand_id === args?.p_brand_key && row.is_active === true);
        for (const platform of requested) {
          const matches = active.filter(row => row.platform === platform);
          if (matches.length === 0) return Promise.resolve({ data: { ok: false, error: "CHANNEL_NOT_ACTIVE_FOR_BRAND" }, error: null });
          if (matches.length !== 1) return Promise.resolve({ data: { ok: false, error: "CHANNEL_NOT_UNIQUE_FOR_BRAND" }, error: null });
        }
        publication.status = "scheduled";
        publication.scheduled_platforms = requested;
        publication.scheduled_at = "2026-09-27T20:00:00Z";
        publication.updated_at = "2026-09-27T20:00:00Z";
        return Promise.resolve({ data: { ok: true, publication }, error: null });
      }
      if (name === "workspace_brand_marketing_draft_create") {
        const requested = Array.isArray(args?.p_platforms) ? args?.p_platforms as string[] : [];
        const active = new Set(channels
          .filter(row => row.brand_id === args?.p_brand_key && row.is_active === true)
          .map(row => String(row.platform)));
        if (requested.some(platform => !active.has(platform))) {
          return Promise.resolve({ data: { ok: false, error: "CHANNEL_NOT_ACTIVE_FOR_BRAND" }, error: null });
        }
        const publication = {
          id: "22222222-2222-4222-8222-222222222222",
          brand_id: args?.p_brand_key,
          content_type: "social",
          title: args?.p_title || null,
          description: args?.p_description,
          tags: args?.p_tags || [],
          thumbnail_url: null,
          scheduled_platforms: requested,
          status: "draft",
          scheduled_at: null,
          published_at: null,
          created_at: "2026-09-27T12:00:00Z",
          updated_at: "2026-09-27T12:00:00Z",
          total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0,
        };
        publications.push(publication);
        return Promise.resolve({ data: { ok: true, publication }, error: null });
      }
      throw new Error("Unexpected RPC " + name);
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
  const snapshotCall = calls.find(call => call.method === "rpc" && call.args[0] === "workspace_brand_marketing_snapshot");
  assert.ok(snapshotCall);
  assert.equal((snapshotCall?.args[1] as any).p_brand_key, "pinosoecolife");
  assert.equal((snapshotCall?.args[1] as any).p_user_id, userId);
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
  const draftCall = calls.find(call => call.method === "rpc" && call.args[0] === "workspace_brand_marketing_draft_create");
  assert.ok(draftCall);
  const draftArgs = draftCall?.args[1] as any;
  assert.equal(draftArgs.p_brand_key, "pinosoecolife");
  assert.equal(draftArgs.p_description, "Et trygt utkast for Pinoso EcoLife.");
  assert.deepEqual(draftArgs.p_tags, ["pinoso", "villa"]);
  assert.deepEqual(draftArgs.p_platforms, ["facebook", "instagram"]);
  assert.equal(JSON.stringify(draftArgs).includes("zeneco"), false);
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
  assert.equal(calls.filter(call => call.method === "rpc" && call.args[0] === "workspace_brand_marketing_draft_create").length, 1);
});

test("other-brand workspace is denied before marketing table access", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  calls.length = 0;
  const response = await GET(request(cookie) as any, { params: { brandKey: "zeneco" } });
  assert.equal(response.status, 403);
  assert.equal(calls.some(call => call.method === "rpc" && ["workspace_brand_marketing_snapshot","workspace_brand_marketing_draft_create"].includes(String(call.args[0]))), false);
});


test("marketing publish queues only an exact-brand stored draft with explicit publish permission", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  permissions = ["marketing.read", "marketing.draft", "marketing.publish"];
  const response = await PATCH(request(cookie, "PATCH", {
    publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    platforms: ["facebook"],
    brand_id: "zeneco",
    content: "request body must never replace stored content",
  }) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.queued, true);
  assert.equal(body.publication.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(body.publication.status, "scheduled");
  assert.deepEqual(body.publication.scheduledPlatforms, ["facebook"]);
  const call = calls.find(item => item.method === "rpc" && item.args[0] === "workspace_brand_marketing_publish_queue");
  assert.ok(call);
  const args = call?.args[1] as any;
  assert.equal(args.p_brand_key, "pinosoecolife");
  assert.equal(args.p_publication_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(JSON.stringify(args).includes("zeneco"), false);
  assert.equal(JSON.stringify(args).includes("request body must never replace stored content"), false);
});

test("marketing publish requires complete permission and supported active platform", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  permissions = ["marketing.read", "marketing.draft"];
  let response = await PATCH(request(cookie, "PATCH", {
    publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    platforms: ["facebook"],
  }) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 403);

  permissions = ["marketing.read", "marketing.draft", "marketing.publish"];
  response = await PATCH(request(cookie, "PATCH", {
    publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    platforms: ["youtube"],
  }) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 400);
});
