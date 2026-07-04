import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { setDemoSitesSupabaseFactoryForTests } from "@/lib/demosites-api-supabase";
import { POST as POSTClaim } from "./claim/route";
import { GET as GETExpire, POST as POSTExpire } from "./expire/route";
import { POST as POSTRequest } from "./request/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.DEMOSITES_CRON_SECRET = "cron-secret";
  setDemoSitesSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  delete process.env.DEMOSITES_CRON_SECRET;
  delete process.env.CRON_SECRET;
  setDemoSitesSupabaseFactoryForTests(null);
});

test("DemoSites public routes reject invalid requests before service-role database access", async () => {
  let called = false;
  setDemoSitesSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const responses = await Promise.all([
    POSTRequest(jsonRequest("/api/saas/demosites/request", "POST", { companyName: "", customerEmail: "" }) as any),
    POSTClaim(jsonRequest("/api/saas/demosites/claim", "POST", {}) as any),
    POSTClaim(jsonRequest("/api/saas/demosites/claim", "POST", { token: "bad token" }) as any),
    GETExpire(jsonRequest("/api/saas/demosites/expire", "GET") as any),
    POSTExpire(jsonRequest("/api/saas/demosites/expire", "POST") as any),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [400, 400, 400, 401, 401],
  );
  assert.equal(called, false);
});
