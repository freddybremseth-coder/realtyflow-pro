import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { GET, POST } from "./route";

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-access-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.REALTYFLOW_MIGRATION_SECRET = "proxy-test-secret";
});

const endpoint = "https://realtyflow.test/api/workspaces/access-plans";
function req(method: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(endpoint, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("draft plans require a verified owner session for reads and writes", async () => {
  const unauthenticated = await GET(req("GET") as any);
  assert.equal(unauthenticated.status, 401);
  const post = await POST(req("POST", undefined, { action: "SAVE_DRAFT" }) as any);
  assert.equal(post.status, 401);
  const nonOwner = await createAdminSession("employee@example.test", "SALES");
  const rejected = await GET(req("GET", `realtyflow_admin=${nonOwner}`) as any);
  assert.equal(rejected.status, 401); // no active legacy access profile
});

test("owner-only Re-Master proxy does not impersonate a human permission editor", async () => {
  const response = await GET(req("GET", undefined, undefined, {
    "x-remaster-migration-secret": "proxy-test-secret",
    "x-remaster-admin": "owner@example.test",
  }) as any);
  assert.equal(response.status, 403);
});

test("cross-origin and non-JSON writes are blocked before any database access", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const forged = await POST(req("POST", cookie, { action: "SAVE_DRAFT" }, {
    origin: "https://evil.example.test",
  }) as any);
  assert.equal(forged.status, 403);
  const crossSite = await POST(req("POST", cookie, { action: "SAVE_DRAFT" }, {
    "sec-fetch-site": "cross-site",
  }) as any);
  assert.equal(crossSite.status, 403);
  const missingJson = await POST(req("POST", cookie, undefined) as any);
  assert.equal(missingJson.status, 403);
});

test("unrecognised permission and invalid brand strings fail before database access", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const badBrand = await POST(req("POST", cookie, {
    action: "SAVE_DRAFT", brandKey: "pinosoecolife,zeneco", email: "user@example.test", permissions: [],
  }) as any);
  assert.equal(badBrand.status, 400);
  const badPermission = await POST(req("POST", cookie, {
    action: "SAVE_DRAFT", brandKey: "pinosoecolife", email: "user@example.test", permissions: ["finance.read"],
  }) as any);
  assert.equal(badPermission.status, 400);
  const duplicate = await POST(req("POST", cookie, {
    action: "SAVE_DRAFT", brandKey: "pinosoecolife", email: "user@example.test", permissions: ["crm.read", "crm.read"],
  }) as any);
  assert.equal(duplicate.status, 400);
});

test("valid owner draft cannot activate access when database is not configured", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const response = await POST(req("POST", cookie, {
    action: "SAVE_DRAFT", brandKey: "pinosoecolife", email: "user@example.test", permissions: ["crm.read"],
  }) as any);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "WORKSPACE_UNAVAILABLE");
});
