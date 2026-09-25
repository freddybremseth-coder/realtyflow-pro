import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, POST } from "./route";

const endpoint = "https://realtyflow.test/api/workspaces/zeneco-joint-review";
const id = "11111111-1111-4111-8111-111111111111";
const cookie = async () => `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
function req(method: "GET" | "POST", signedCookie = "", payload?: unknown, extra: Record<string, string> = {}) {
  return new NextRequest(endpoint, {
    method,
    headers: { ...(signedCookie ? { cookie: signedCookie } : {}),
      ...(payload === undefined ? {} : { "content-type": "application/json", origin: "https://realtyflow.test" }),
      ...extra },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}
test.beforeEach(() => {
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.REALTYFLOW_SESSION_SECRET = "zen-joint-review-tests";
  process.env.REALTYFLOW_MIGRATION_SECRET = "proxy-only-secret";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  setPlatformSupabaseFactoryForTests(null);
});
test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

test("anonymous and owner migration proxy cannot read candidate customer details or approve", async () => {
  assert.equal((await GET(req("GET") as any)).status, 401);
  assert.equal((await POST(req("POST", "", { contactId: id, action: "EXCLUDE" }) as any)).status, 401);
  const proxyHeaders = { "x-remaster-migration-secret": "proxy-only-secret",
    "x-remaster-admin": "owner@example.test" };
  assert.equal((await GET(req("GET", "", undefined, proxyHeaders) as any)).status, 403);
  assert.equal((await POST(req("POST", "", { contactId: id, action: "EXCLUDE" },
    { ...proxyHeaders, "content-type": "application/json" }) as any)).status, 403);
});

test("owner review never serializes stale or wrong-brand rows even from a malformed RPC result", async () => {
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => {
      assert.equal(name, "workspace_zeneco_review_candidates");
      return { error: null, data: { hasMore: false, contacts: [
        { id, brand_id: "zeneco", brand: "zeneco", name: "Verified candidate",
          email: "candidate@example.test", created_at: "2026-09-24T15:00:00Z",
          source: "website", status: "unreviewed", private_notes: "PRIVATE INTERNAL NOTE" },
        { id: "22222222-2222-4222-8222-222222222222", brand_id: "soleada",
          brand: "soleada", name: "OTHER BRAND PRIVATE", created_at: "2026-09-24T15:00:00Z", status: "unreviewed" },
        { id: "33333333-3333-4333-8333-333333333333", brand_id: "zeneco",
          brand: "zeneco", name: "OLD PRIVATE CUSTOMER", created_at: "2026-09-20T15:00:00Z", status: "unreviewed" },
      ] } };
    },
  } as unknown as SupabaseClient));
  const result = await GET(req("GET", await cookie()) as any);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.contacts.map((row: { name: string }) => row.name), ["Verified candidate"]);
  assert.equal(body.activationAvailable, false);
  assert.equal(JSON.stringify(body).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(body).includes("private_notes"), false);
});

test("owner must document an actual first enquiry and source, not accept CRM creation date alone", async () => {
  const calls: string[] = [];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => { calls.push(name); return { data: true, error: null }; },
  } as unknown as SupabaseClient));
  const signed = await cookie();
  for (const body of [
    { contactId: id, action: "APPROVE", reviewReason: "New enquiry" },
    { contactId: id, action: "APPROVE", firstGenuineEnquiryAt: "2026-09-20T10:00:00Z",
      receivedSource: "website", evidenceReference: "incoming-email-1", reviewReason: "New enquiry" },
    { contactId: id, action: "APPROVE", firstGenuineEnquiryAt: "2026-09-24T10:00:00Z",
      receivedSource: "website", evidenceReference: "", reviewReason: "New enquiry" },
    { contactId: id, action: "APPROVE", firstGenuineEnquiryAt: "2026-09-24T10:00:00Z",
      receivedSource: "website", evidenceReference: "incoming-email-1", reviewReason: "short" },
    { contactId: "../../zeneco", action: "APPROVE", firstGenuineEnquiryAt: "2026-09-24T10:00:00Z",
      receivedSource: "website", evidenceReference: "incoming-email-1", reviewReason: "New enquiry" },
    { contactId: id, action: "EXCLUDE", firstGenuineEnquiryAt: "2026-09-24T10:00:00Z",
      reviewReason: "Existing customer" },
  ]) {
    const result = await POST(req("POST", signed, body) as any);
    assert.equal(result.status, 400);
  }
  assert.deepEqual(calls, []);
});

test("owner approved review calls one service-only RPC with signed owner identity and evidence", async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });
      return { error: null, data: true };
    },
  } as unknown as SupabaseClient));
  const firstGenuineEnquiryAt = "2026-09-24T10:00:00.000Z";
  const result = await POST(req("POST", await cookie(), {
    contactId: id, action: "APPROVE", firstGenuineEnquiryAt,
    receivedSource: "website form", evidenceReference: "website-intake-20260924-1",
    reviewReason: "First verified enquiry after agreement date",
  }) as any);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.employeeAccessActivated, false);
  assert.equal(body.status, "approved");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "workspace_zeneco_review_lead");
  assert.equal(calls[0].params.p_actor_email, "owner@example.test");
  assert.equal(calls[0].params.p_contact_id, id);
  assert.equal(calls[0].params.p_first_genuine_enquiry_at, firstGenuineEnquiryAt);
  assert.equal(calls[0].params.p_evidence_reference, "website-intake-20260924-1");
});

test("owner can revoke after review; forged origins fail before service RPC", async () => {
  const calls: string[] = [];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string) => { calls.push(name); return { error: null, data: true }; },
  } as unknown as SupabaseClient));
  const signed = await cookie();
  assert.equal((await POST(req("POST", signed, { contactId: id, action: "APPROVE" }, {
    origin: "https://evil.example.test",
  }) as any)).status, 403);
  assert.equal((await POST(req("POST", signed, { contactId: id, action: "EXCLUDE", reviewReason: "Historical customer" }, {
    "sec-fetch-site": "cross-site",
  }) as any)).status, 403);
  assert.deepEqual(calls, []);
  const revoked = await POST(req("POST", signed, {
    contactId: id, action: "REVOKE", reviewReason: "New evidence shows prior relationship",
  }) as any);
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).status, "revoked");
  assert.deepEqual(calls, ["workspace_zeneco_review_lead"]);
});

test("unapplied migration or ineligible old contact always fails closed", async () => {
  const signed = await cookie();
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async () => ({ data: null, error: { message: "MIGRATION_MISSING" } }),
  } as unknown as SupabaseClient));
  assert.equal((await GET(req("GET", signed) as any)).status, 503);
  assert.equal((await POST(req("POST", signed, {
    contactId: id, action: "EXCLUDE", reviewReason: "Historical customer",
  }) as any)).status, 503);
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async () => ({ data: false, error: null }),
  } as unknown as SupabaseClient));
  const result = await POST(req("POST", signed, {
    contactId: id, action: "APPROVE", firstGenuineEnquiryAt: "2026-09-24T10:00:00Z",
    receivedSource: "website", evidenceReference: "incoming-email-1", reviewReason: "First verified enquiry",
  }) as any);
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error, "REVIEW_REJECTED_OR_CONTACT_INELIGIBLE");
});
