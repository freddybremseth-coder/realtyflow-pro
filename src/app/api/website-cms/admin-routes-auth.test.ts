import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { POST as POSTWebsiteCmsManage } from "./manage/route";
import { POST as POSTWebsiteCmsPublish } from "./publish/route";
import { GET as GETWebsiteCmsTargets } from "./targets/route";
import { DELETE as DELETEWebsitePosts, GET as GETWebsitePosts, PATCH as PATCHWebsitePosts, POST as POSTWebsitePosts } from "../website-posts/route";
import { POST as POSTWebsitePostUpload } from "../website-posts/upload/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>, cookie?: string) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "website-cms-admin-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test("website CMS admin routes require admin before database or integration access", async () => {
  const responses = await Promise.all([
    GETWebsitePosts(jsonRequest("/api/website-posts", "GET") as any),
    POSTWebsitePosts(jsonRequest("/api/website-posts", "POST", { title: "Demo", slug: "demo" }) as any),
    PATCHWebsitePosts(jsonRequest("/api/website-posts", "PATCH", { id: "post-1", title: "Demo" }) as any),
    DELETEWebsitePosts(jsonRequest("/api/website-posts", "DELETE", { id: "post-1" }) as any),
    POSTWebsitePostUpload(jsonRequest("/api/website-posts/upload", "POST") as any),
    GETWebsiteCmsTargets(jsonRequest("/api/website-cms/targets", "GET") as any),
    POSTWebsiteCmsPublish(
      jsonRequest("/api/website-cms/publish", "POST", {
        brand_id: "soleada",
        title: "Demo",
        content: "Demo content",
      }) as any,
    ),
    POSTWebsiteCmsManage(
      jsonRequest("/api/website-cms/manage", "POST", {
        action: "update",
        publication_id: "publication-1",
      }) as any,
    ),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});

test("website CMS publish and manage require service-role configuration after admin auth", async () => {
  const token = await createAdminSession("freddy.bremseth@gmail.com");
  const cookie = `realtyflow_admin=${token}`;

  const responses = await Promise.all([
    POSTWebsiteCmsPublish(
      jsonRequest(
        "/api/website-cms/publish",
        "POST",
        { brand_id: "soleada", title: "Demo", content: "Demo content" },
        cookie,
      ) as any,
    ),
    POSTWebsiteCmsManage(
      jsonRequest(
        "/api/website-cms/manage",
        "POST",
        { action: "update", publication_id: "publication-1" },
        cookie,
      ) as any,
    ),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, "Supabase er ikke konfigurert");
  }
});
