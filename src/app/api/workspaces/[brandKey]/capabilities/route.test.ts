import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const calls: string[] = [];
test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-capabilities-test";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  calls.length = 0;
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: (method: string) => {
      calls.push(method);
      return Promise.resolve({
        data: { brand: { id: "brand-1", brand_key: "pinosoecolife" }, grant: null }, error: null,
      });
    },
  } as unknown as SupabaseClient));
});
test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

const request = (cookie?: string) => new NextRequest(
  "https://realtyflow.test/api/workspaces/pinosoecolife/capabilities",
  { headers: cookie ? { cookie } : {} },
);

test("capabilities denies unsigned sessions without touching database", async () => {
  const result = await GET(request() as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 401);
  assert.deepEqual(calls, []);
});

test("owner capabilities use service-only scope lookup without requiring employee grant", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const result = await GET(request(cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.brand, "pinosoecolife");
  assert.equal(body.permissions.includes("crm.read"), true);
  assert.equal(body.permissions.includes("properties.catalog.read"), true);
  assert.deepEqual(calls, ["workspace_brand_grant"]);
});

test("requested brand must be canonical and exactly match verified scope", async () => {
  const cookie = `realtyflow_admin=${await createAdminSession("owner@example.test")}`;
  const malformed = await GET(request(cookie) as any, { params: { brandKey: "zeneco, pinosoecolife" } });
  assert.equal(malformed.status, 404);
  assert.deepEqual(calls, []);
  const wrongBrand = await GET(request(cookie) as any, { params: { brandKey: "zeneco" } });
  assert.equal(wrongBrand.status, 404);
  assert.deepEqual(calls, ["workspace_brand_grant"]);
});
