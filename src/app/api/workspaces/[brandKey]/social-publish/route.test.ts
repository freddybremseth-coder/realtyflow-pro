import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { setWorkspaceSocialPublishRuntimeForTests } from "@/lib/workspaces/social-publish-runtime";
import { GET, POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const publicationId = "22222222-2222-4222-8222-222222222222";
const facebookChannelId = "33333333-3333-4333-8333-333333333333";
const instagramChannelId = "44444444-4444-4444-8444-444444444444";
const attemptId = "55555555-5555-4555-8555-555555555555";

let permissions: string[] = ["marketing.read", "marketing.draft", "marketing.publish"];
const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
const publishCalls: any[] = [];
let preparedOverride: any = null;
let runtimeResult: any = null;

function fakeDb() {
  return {
    rpc(name: string, args?: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "workspace_brand_grant") {
        const brand = String(args?.p_brand_key || "");
        return Promise.resolve({
          data: {
            brand: { id: brand === "pinosoecolife" ? "pinoso-id" : "zen-id", brand_key: brand },
            grant: brand === "pinosoecolife" ? {
              brand_id: "pinoso-id",
              user_id: userId,
              email: "staff@example.test",
              status: "active",
              permissions,
            } : null,
          },
          error: null,
        });
      }
      if (name === "workspace_brand_social_publish_snapshot") {
        return Promise.resolve({
          data: {
            channels: [
              { platform: "facebook", displayName: "Pinoso Facebook", externalId: "MUST-NOT-LEAK" },
              { platform: "instagram", displayName: "Pinoso Instagram", token: "MUST-NOT-LEAK" },
            ],
            publications: [{
              id: publicationId,
              hasImage: true,
              plannedPlatforms: ["facebook", "instagram"],
              description: "MUST-NOT-LEAK-FROM-SNAPSHOT",
            }],
          },
          error: null,
        });
      }
      if (name === "workspace_brand_social_publish_prepare") {
        return Promise.resolve({
          data: preparedOverride || {
            ok: true,
            attemptId,
            publicationId,
            content: "Server-approved Pinoso content",
            imageUrl: "https://cdn.example.test/pinoso.jpg",
            channels: [
              { id: facebookChannelId, platform: "facebook", displayName: "Pinoso Facebook" },
            ],
          },
          error: null,
        });
      }
      if (name === "workspace_brand_social_publish_finalize") {
        return Promise.resolve({
          data: { ok: true, attemptId, status: args?.p_success ? "published" : "failed" },
          error: null,
        });
      }
      throw new Error("Unexpected RPC " + name);
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, email: "staff@example.test" } },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

function request(
  brand = "pinosoecolife",
  method = "GET",
  body?: unknown,
  cookie?: string,
) {
  return new NextRequest(`https://realtyflow.test/api/workspaces/${brand}/social-publish`, {
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

let previousFetch: typeof fetch;

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-social-publish-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-social.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "workspace-service-key";
  permissions = ["marketing.read", "marketing.draft", "marketing.publish"];
  rpcCalls.length = 0;
  publishCalls.length = 0;
  preparedOverride = null;
  runtimeResult = {
    results: [{
      platform: "facebook",
      success: true,
      postId: "external-post-id",
      postUrl: "https://www.facebook.com/external-post-id",
      resolved: {
        source: "social_channels",
        displayName: "Pinoso Facebook",
        externalId: "PAGE-ID-MUST-NOT-LEAK",
      },
    }],
    anySuccess: true,
  };
  setPlatformSupabaseFactoryForTests(() => fakeDb());
  setWorkspaceSocialPublishRuntimeForTests({
    publish: async input => {
      publishCalls.push(input);
      return runtimeResult;
    },
  });
  previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (!String(input).includes("/rest/v1/brand_settings")) throw new Error("Unexpected external request");
    return new Response(JSON.stringify({
      settings: {
        profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

test.afterEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  setWorkspaceSocialPublishRuntimeForTests(null);
  globalThis.fetch = previousFetch;
});

test("snapshot exposes safe platform labels without account IDs, tokens or external IDs", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");

  const response = await GET(request("pinosoecolife", "GET", undefined, cookie) as any,
    { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.channels.length, 2);
  assert.equal("id" in body.channels[0], false);
  assert.equal(body.publications[0].id, publicationId);
  assert.deepEqual(body.supportedPlatforms, ["facebook", "instagram"]);
  assert.equal(JSON.stringify(body).includes("MUST-NOT-LEAK"), false);
  assert.equal(JSON.stringify(body).includes("externalId"), false);
  assert.equal(JSON.stringify(body).includes("token"), false);

  const denied = await GET(request("zeneco", "GET", undefined, cookie) as any,
    { params: { brandKey: "zeneco" } });
  assert.equal(denied.status, 403);
});

test("publish is denied before prepare or external runtime without marketing.publish", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  permissions = ["marketing.read", "marketing.draft"];

  const response = await POST(request("pinosoecolife", "POST", {
    publicationId,
    platforms: ["facebook"],
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });

  assert.equal(response.status, 403);
  assert.equal(publishCalls.length, 0);
  assert.equal(rpcCalls.some(call => call.name === "workspace_brand_social_publish_prepare"), false);
});

test("request cannot forge brand content image platform or external account", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");

  const response = await POST(request("pinosoecolife", "POST", {
    publicationId,
    platforms: ["facebook"],
    brandId: "zeneco",
    platform: "linkedin",
    channelIds: [instagramChannelId],
    content: "ATTACKER CONTENT",
    imageUrl: "https://attacker.example/evil.jpg",
    socialChannelIds: { facebook: "attacker-channel" },
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });

  assert.equal(response.status, 200);
  assert.equal(publishCalls.length, 1);
  assert.deepEqual(publishCalls[0], {
    draftId: publicationId,
    platforms: ["facebook"],
    content: "Server-approved Pinoso content",
    brandId: "pinosoecolife",
    imageUrl: "https://cdn.example.test/pinoso.jpg",
    socialChannelIds: { facebook: facebookChannelId },
  });
  assert.equal(JSON.stringify(publishCalls[0]).includes("ATTACKER CONTENT"), false);
  assert.equal(JSON.stringify(publishCalls[0]).includes("attacker.example"), false);
  assert.equal(JSON.stringify(publishCalls[0]).includes("attacker-channel"), false);

  const grants = rpcCalls.filter(call => call.name === "workspace_brand_grant");
  assert.ok(grants.length >= 2, "publish must revalidate live brand grant before external call");
  const final = rpcCalls.find(call =>
    call.name === "workspace_brand_social_publish_finalize" &&
    call.args?.p_success === true);
  assert.ok(final);
});

test("malformed prepared payload is finalized failed before any external publish", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  preparedOverride = {
    ok: true,
    attemptId,
    publicationId,
    content: "",
    imageUrl: "https://cdn.example.test/pinoso.jpg",
    channels: [{ id: facebookChannelId, platform: "facebook", displayName: "Pinoso Facebook" }],
  };

  const response = await POST(request("pinosoecolife", "POST", {
    publicationId,
    platforms: ["facebook"],
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });

  assert.equal(response.status, 503);
  assert.equal(publishCalls.length, 0);
  const final = rpcCalls.find(call =>
    call.name === "workspace_brand_social_publish_finalize" &&
    call.args?.p_success === false);
  assert.ok(final);
  assert.match(String(final?.args?.p_error || ""), /ugyldig publiseringsgrunnlag/i);
});

test("wrong-brand or invalid channel resolution fails before external publish", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  preparedOverride = { ok: false, error: "CHANNEL_SCOPE_INVALID" };

  const response = await POST(request("pinosoecolife", "POST", {
    publicationId,
    platforms: ["facebook"],
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });

  assert.equal(response.status, 409);
  assert.equal(publishCalls.length, 0);
});

test("instagram without an existing image fails before external publish", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  preparedOverride = { ok: false, error: "INSTAGRAM_IMAGE_REQUIRED" };

  const response = await POST(request("pinosoecolife", "POST", {
    publicationId,
    platforms: ["instagram"],
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });

  assert.equal(response.status, 409);
  assert.equal(publishCalls.length, 0);
  assert.match((await response.json()).error.message, /Instagram/);
});

test("partial external success is returned without leaking channel external IDs", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  preparedOverride = {
    ok: true,
    attemptId,
    publicationId,
    content: "Server-approved Pinoso content",
    imageUrl: "https://cdn.example.test/pinoso.jpg",
    channels: [
      { id: facebookChannelId, platform: "facebook", displayName: "Pinoso Facebook" },
      { id: instagramChannelId, platform: "instagram", displayName: "Pinoso Instagram" },
    ],
  };
  runtimeResult = {
    results: [
      {
        platform: "facebook", success: true, postId: "fb-post",
        postUrl: "https://www.facebook.com/fb-post",
        resolved: { source: "social_channels", displayName: "Pinoso Facebook", externalId: "FB-PAGE-SECRETISH" },
      },
      {
        platform: "instagram", success: false, error: "Instagram temporary failure",
        resolved: { source: "social_channels", displayName: "Pinoso Instagram", externalId: "IG-ID-SECRETISH" },
      },
    ],
    anySuccess: true,
  };

  const response = await POST(request("pinosoecolife", "POST", {
    publicationId,
    platforms: ["facebook", "instagram"],
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.published, true);
  assert.equal(body.partial, true);
  assert.equal(body.results.length, 2);
  assert.equal(JSON.stringify(body).includes("FB-PAGE-SECRETISH"), false);
  assert.equal(JSON.stringify(body).includes("IG-ID-SECRETISH"), false);
  const final = rpcCalls.find(call =>
    call.name === "workspace_brand_social_publish_finalize" &&
    call.args?.p_success === true);
  assert.ok(final);
});

test("publisher throw is audited failed and returned as controlled error", async () => {
  const cookie = "realtyflow_admin=" +
    await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  setWorkspaceSocialPublishRuntimeForTests({
    publish: async () => { throw new Error("Graph unavailable"); },
  });

  const response = await POST(request("pinosoecolife", "POST", {
    publicationId,
    platforms: ["facebook"],
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });

  assert.equal(response.status, 502);
  const final = rpcCalls.find(call =>
    call.name === "workspace_brand_social_publish_finalize" &&
    call.args?.p_success === false);
  assert.ok(final);
  assert.equal(final?.args?.p_error, "Graph unavailable");
});
