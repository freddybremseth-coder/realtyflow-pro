import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";
let permissions: string[] = ["content.read", "content.edit", "content.publish"];
const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
const webhookBodies: any[] = [];

const cmsSettings = {
  website: "https://pinosoecolife.com",
  websiteCmsWebhookUrl: "https://www.pinosoecolife.com/api/realtyflow/publish",
  websiteCmsWebhookSecret: "TOP_SECRET_NEVER_RETURN",
  websiteCmsDestinationsText: "Magasin|/magasin|magazine|magasin\nGuider|/guider|guide|guider",
  websiteCmsDefaultDestination: "magasin",
};

function fakeDb() {
  return {
    from(table: string) {
      if (table === "brand_settings") {
        let brand = "";
        const query: any = {
          select: () => query,
          eq: (_column: string, value: string) => { brand = value; return query; },
          maybeSingle: async () => {
            if (brand === "workspace-auth:runtime") {
              return { data: { settings: { enabled: true }, updated_at: null }, error: null };
            }
            if (brand === "pinosoecolife") {
              return { data: { settings: cmsSettings }, error: null };
            }
            if (brand === "zeneco") {
              return { data: { settings: { website: "https://zenecohomes.com" } }, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      }
      if (table === "content_publications") {
        let requestedId = "";
        let requestedBrand = "";
        const query: any = {
          select: () => query,
          eq: (column: string, value: string) => {
            if (column === "id") requestedId = value;
            if (column === "brand_id") requestedBrand = value;
            return query;
          },
          maybeSingle: async () => ({
            data: requestedId === publicationId && requestedBrand === "pinosoecolife"
              ? {
                  id: publicationId, brand_id: "pinosoecolife", content_type: "website_magazine",
                  title: "Existing Pinoso page", description: "Existing content",
                  ai_description: "Existing summary",
                  tags: ["website","cms:magasin","slug:existing-pinoso-page"],
                  media_urls: [], ai_image_url: null,
                  content_features: { primary_keyword: "pinoso" },
                }
              : null,
            error: null,
          }),
        };
        return query;
      }
      throw new Error("Unexpected table " + table);
    },
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "workspace_login_directory") {
        return Promise.resolve({
          data: { user_id: userId, username: "andrea", email: "staff@example.test", display_name: "Andrea", status: "active" },
          error: null,
        });
      }
      if (name === "workspace_brand_grant") {
        const brand = String(args?.p_brand_key || "");
        return Promise.resolve({
          data: {
            brand: { id: brand === "pinosoecolife" ? "pinoso-id" : "zen-id", brand_key: brand },
            grant: brand === "pinosoecolife" ? {
              brand_id: "pinoso-id", user_id: userId, email: "staff@example.test",
              status: "active", permissions,
            } : null,
          },
          error: null,
        });
      }
      if (name === "workspace_brand_content_snapshot") {
        return Promise.resolve({
          data: {
            drafts: [{
              id: draftId, destinationId: "magasin", destinationLabel: "Magasin",
              destinationPath: "/magasin", contentType: "magazine",
              title: "Pinoso draft", slug: "pinoso-draft", summary: "Summary",
              markdown: "Draft body", tags: [], supportingKeywords: [],
            }],
            published: [],
          },
          error: null,
        });
      }
      if (name === "workspace_brand_content_draft_save") {
        return Promise.resolve({
          data: {
            id: draftId,
            destinationId: args?.p_destination_id,
            destinationLabel: args?.p_destination_label,
            destinationPath: args?.p_destination_path,
            contentType: args?.p_content_type,
            title: args?.p_title,
            slug: args?.p_slug,
            summary: args?.p_summary,
            markdown: args?.p_markdown,
            imageUrl: args?.p_image_url,
            tags: args?.p_tags,
            primaryKeyword: args?.p_primary_keyword,
            supportingKeywords: args?.p_supporting_keywords,
            audience: args?.p_audience,
            sourcePublicationId: args?.p_source_publication_id,
          },
          error: null,
        });
      }
      if (name === "workspace_brand_content_publish_payload") {
        return Promise.resolve({
          data: {
            id: draftId, destinationId: "magasin", destinationLabel: "Magasin",
            destinationPath: "/magasin", contentType: "magazine",
            title: "Pinoso draft", slug: "pinoso-draft", summary: "Summary",
            markdown: "Draft body", imageUrl: null, tags: ["pinoso"],
            primaryKeyword: "living in pinoso",
            supportingKeywords: ["pinoso villa"], audience: "Norwegian buyers",
          },
          error: null,
        });
      }
      if (name === "workspace_brand_content_publish_finalize") {
        return Promise.resolve({
          data: { ok: true, draftId, publicationId, version: 1 },
          error: null,
        });
      }
      if (name === "workspace_brand_content_versions") {
        return Promise.resolve({ data: [{ id: "version-1", version: 1, snapshot: {}, createdAt: "2026-09-27T12:00:00Z" }], error: null });
      }
      if (name === "workspace_brand_content_restore_version") {
        return Promise.resolve({ data: { id: draftId, title: "Restored", restoredVersion: 1 }, error: null });
      }
      throw new Error("Unexpected RPC " + name);
    },
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
  } as unknown as SupabaseClient;
}

function request(brand = "pinosoecolife", method = "GET", body?: unknown, cookie?: string) {
  return new NextRequest(`https://realtyflow.test/api/workspaces/${brand}/content`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json", origin: "https://realtyflow.test" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let oldFetch: typeof fetch;
test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "content-workspace-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "workspace-service-key";
  permissions = ["content.read", "content.edit", "content.publish"];
  calls.length = 0;
  webhookBodies.length = 0;
  setPlatformSupabaseFactoryForTests(() => fakeDb());
  oldFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === cmsSettings.websiteCmsWebhookUrl) {
      webhookBodies.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({ url: "https://pinosoecolife.com/magasin/pinoso-draft" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/brand_settings")) {
      return new Response(JSON.stringify({
        settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected external request: " + url);
  }) as typeof fetch;
});

test.afterEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  globalThis.fetch = oldFetch;
});

test("content snapshot is exact-brand and never exposes webhook credentials", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await GET(request("pinosoecolife", "GET", undefined, cookie) as any,
    { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.brand, "pinosoecolife");
  assert.equal(body.drafts[0].title, "Pinoso draft");
  assert.deepEqual(body.destinations.map((item: any) => item.label).slice(0, 2), ["Magasin", "Guider"]);
  assert.equal(JSON.stringify(body).includes("TOP_SECRET_NEVER_RETURN"), false);
  assert.equal(JSON.stringify(body).includes("websiteCmsWebhookUrl"), false);

  const denied = await GET(request("zeneco", "GET", undefined, cookie) as any,
    { params: { brandKey: "zeneco" } });
  assert.equal(denied.status, 403);
});

test("saving content is brand-fixed and destination data comes from server config", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await POST(request("pinosoecolife", "POST", {
    action: "save",
    brand_id: "zeneco",
    destinationId: "magasin",
    destinationLabel: "FORGED",
    destinationPath: "/forged",
    title: "Living in Pinoso",
    slug: "Living in Pinoso",
    summary: "Useful guide",
    markdown: "# Living in Pinoso",
    primaryKeyword: "living in pinoso",
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const save = calls.find(call => call.name === "workspace_brand_content_draft_save");
  assert.ok(save);
  assert.equal(save?.args?.p_brand_key, "pinosoecolife");
  assert.equal(save?.args?.p_destination_label, "Magasin");
  assert.equal(save?.args?.p_destination_path, "/magasin");
  assert.equal(save?.args?.p_slug, "living-in-pinoso");
  assert.equal(JSON.stringify(save?.args).includes("FORGED"), false);
  assert.equal(JSON.stringify(save?.args).includes("/forged"), false);
});

test("publishing requires explicit publish permission before any website request", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  permissions = ["content.read", "content.edit"];
  const denied = await POST(request("pinosoecolife", "POST", {
    action: "publish", draftId,
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(denied.status, 403);
  assert.equal(webhookBodies.length, 0);
  assert.equal(calls.some(call => call.name === "workspace_brand_content_publish_payload"), false);
});

test("publishing rechecks permission and posts only the exact brand payload", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await POST(request("pinosoecolife", "POST", {
    action: "publish", draftId, brand_id: "zeneco", webhook: "https://evil.example",
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.published, true);
  assert.equal(body.version, 1);
  assert.equal(webhookBodies.length, 1);
  assert.equal(webhookBodies[0].brand.id, "pinosoecolife");
  assert.equal(webhookBodies[0].destination.id, "magasin");
  assert.equal(JSON.stringify(webhookBodies[0]).includes("zeneco"), false);
  assert.equal(JSON.stringify(webhookBodies[0]).includes("evil.example"), false);

  const grants = calls.filter(call => call.name === "workspace_brand_grant");
  assert.ok(grants.length >= 2, "publish must recheck the live brand grant before external action");
  const finalize = calls.find(call => call.name === "workspace_brand_content_publish_finalize");
  assert.equal(finalize?.args?.p_success, true);
});

test("cross-brand published content cannot be cloned into this workspace", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await POST(request("pinosoecolife", "POST", {
    action: "clone_published",
    publicationId: "99999999-9999-4999-8999-999999999999",
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 404);
  assert.equal(calls.some(call => call.name === "workspace_brand_content_draft_save"), false);
});
