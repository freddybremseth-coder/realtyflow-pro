import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { GET, POST } from "./route";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

test.beforeEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-access-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.REALTYFLOW_MIGRATION_SECRET = "proxy-test-secret";
});

test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

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

test("owner can preview aggregate assigned and ambiguous CRM counts without any customer PII", async () => {
  const called: string[] = [];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => {
      called.push(name);
      return name === "workspace_access_snapshot"
        ? { data: { brands: [{ id: "brand-uuid", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" }], plans: [] }, error: null }
        : name === "workspace_contact_brand_counts"
          ? { data: [{ brand_key: "pinosoecolife", assigned: 0, needs_review: 0 }], error: null }
          : { data: { new_crm_records_to_review: 0, approved_joint_records: 0 }, error: null };
    },
  } as unknown as SupabaseClient));
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const response = await GET(req("GET", cookie) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.activationAvailable, false);
  assert.deepEqual(body.contactCounts, [{ brand_key: "pinosoecolife", assigned: 0, needs_review: 0 }]);
  assert.deepEqual(body.zenJointPreview, { new_crm_records_to_review: 0, approved_joint_records: 0 });
  assert.deepEqual(called.sort(), ["workspace_access_snapshot", "workspace_contact_brand_counts", "workspace_zeneco_new_crm_candidates_count"]);
  assert.equal(JSON.stringify(body).includes("contact_email"), false);
});

test("missing aggregate RPC fails closed, rather than fabricating counts or activating access", async () => {
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => name === "workspace_access_snapshot"
      ? { data: { brands: [], plans: [] }, error: null }
      : { data: null, error: { message: "MIGRATION_MISSING" } },
  } as unknown as SupabaseClient));
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const response = await GET(req("GET", cookie) as any);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "WORKSPACE_UNAVAILABLE");
});

test("owner snapshot never equates a post-cutoff CRM row with an approved joint lead", async () => {
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) =>
      name === "workspace_access_snapshot"
        ? { data: { brands: [], plans: [] }, error: null }
        : name === "workspace_contact_brand_counts"
          ? { data: [], error: null }
          : { data: { new_crm_records_to_review: 4, approved_joint_records: 0 }, error: null },
  } as unknown as SupabaseClient));
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const response = await GET(req("GET", cookie) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.zenJointPreview.new_crm_records_to_review, 4);
  assert.equal(body.zenJointPreview.approved_joint_records, 0);
  assert.equal(body.activationAvailable, false);
});

test("Zen access drafts cannot grant full-brand CRM and joint CRM cannot be assigned to Pinoso", async () => {
  const signed = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const legacyZen = await POST(req("POST", signed, {
    action: "SAVE_DRAFT", brandKey: "zeneco", email: "andrea@example.test", permissions: ["crm.read", "crm.write"],
  }) as any);
  assert.equal(legacyZen.status, 400);
  assert.equal((await legacyZen.json()).error, "INVALID_BRAND_CRM_SCOPE");
  const forgedPinoso = await POST(req("POST", signed, {
    action: "SAVE_DRAFT", brandKey: "pinosoecolife", email: "andrea@example.test", permissions: ["crm.joint.read"],
  }) as any);
  assert.equal(forgedPinoso.status, 400);
  assert.equal((await forgedPinoso.json()).error, "INVALID_BRAND_CRM_SCOPE");
  const partialZen = await POST(req("POST", signed, {
    action: "SAVE_DRAFT", brandKey: "zeneco", email: "andrea@example.test", permissions: ["crm.joint.write"],
  }) as any);
  assert.equal(partialZen.status, 400);
  assert.equal((await partialZen.json()).error, "INVALID_BRAND_CRM_SCOPE");
  const forgedPinosoWrite = await POST(req("POST", signed, {
    action: "SAVE_DRAFT", brandKey: "pinosoecolife", email: "andrea@example.test", permissions: ["crm.joint.write"],
  }) as any);
  assert.equal(forgedPinosoWrite.status, 400);
  assert.equal((await forgedPinosoWrite.json()).error, "INVALID_BRAND_CRM_SCOPE");
});

test("owner access plans remain available when only optional new Zen cohort RPC is not installed", async () => {
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => name === "workspace_access_snapshot"
      ? { data: { brands: [{ id: "brand-id", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" }], plans: [] }, error: null }
      : name === "workspace_contact_brand_counts"
        ? { data: [{ brand_key: "pinosoecolife", assigned: 0, needs_review: 0 }], error: null }
        : { data: null, error: { code: "PGRST202",
          message: "Could not find the function public.workspace_zeneco_new_crm_candidates_count() in the schema cache" } },
  } as unknown as SupabaseClient));
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const result = await GET(req("GET", cookie) as any);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.zenJointPreview, null);
  assert.equal(body.activationAvailable, false);
  assert.equal(body.brands[0].brand_key, "pinosoecolife");
});

test("optional Zen RPC real errors must not be silently mistaken for an unapplied migration", async () => {
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => name === "workspace_access_snapshot"
      ? { data: { brands: [], plans: [] }, error: null }
      : name === "workspace_contact_brand_counts"
        ? { data: [], error: null }
        : { data: null, error: { code: "42501", message: "permission denied" } },
  } as unknown as SupabaseClient));
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const result = await GET(req("GET", cookie) as any);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, "WORKSPACE_UNAVAILABLE");
});
