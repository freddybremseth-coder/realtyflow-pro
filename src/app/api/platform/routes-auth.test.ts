import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { POST } from "./commands/route";
import { GET } from "./route";

function request(path: string, method = "GET", cookie?: string, body?: unknown) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "platform-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  setPlatformSupabaseFactoryForTests(null);
});

test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

test("platform routes require an owner session before parsing or database access", async () => {
  const [getResponse, postResponse] = await Promise.all([
    GET(request("/api/platform")),
    POST(request("/api/platform/commands", "POST", undefined, { invalid: true })),
  ]);
  assert.equal(getResponse.status, 401);
  assert.equal(postResponse.status, 401);
  assert.equal((await getResponse.json()).error, "Admin session required");
  assert.equal((await postResponse.json()).error, "Admin session required");
});

test("platform routes fail closed when the server database client is unavailable", async () => {
  const token = await createAdminSession("owner@example.com");
  const cookie = `realtyflow_admin=${token}`;
  const [getResponse, postResponse] = await Promise.all([
    GET(request("/api/platform", "GET", cookie)),
    POST(request("/api/platform/commands", "POST", cookie, { invalid: true })),
  ]);
  assert.equal(getResponse.status, 503);
  assert.equal(postResponse.status, 503);
});

test("platform owner routes load the snapshot and dispatch validated commands", async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "platform_snapshot") {
        return { data: { generatedAt: "2026-07-18T00:00:00.000Z", tenants: [] }, error: null };
      }
      return { data: "11111111-1111-4111-8111-111111111111", error: null };
    },
  } as unknown as SupabaseClient));
  const token = await createAdminSession("owner@example.com");
  const cookie = `realtyflow_admin=${token}`;

  const getResponse = await GET(request("/api/platform", "GET", cookie));
  const postResponse = await POST(request("/api/platform/commands", "POST", cookie, {
    command: "upsert_tenant",
    payload: { slug: "kunde-en", name: "Kunde én", customerType: "customer" },
  }));

  assert.equal(getResponse.status, 200);
  assert.equal(postResponse.status, 200);
  assert.deepEqual(calls.map((call) => call.name), ["platform_snapshot", "platform_upsert_tenant"]);
  assert.equal(calls[1]?.args?.p_actor_email, "owner@example.com");
});
