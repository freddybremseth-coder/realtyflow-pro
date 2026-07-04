import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { setDemoSitesSupabaseFactoryForTests } from "@/lib/demosites-api-supabase";
import { GET as GETFees, PATCH as PATCHFees } from "./fees/route";
import { GET as GETImports, PATCH as PATCHImports } from "./imports/route";
import { POST as POSTLeadAudit } from "./leads/audit/route";
import { GET as GETSetup, PATCH as PATCHSetup } from "./setup/route";
import { POST as POSTUpload } from "./upload/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "demosites-internal-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  setDemoSitesSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  setDemoSitesSupabaseFactoryForTests(null);
});

test("DemoSites internal routes require admin before service-role database access", async () => {
  let called = false;
  setDemoSitesSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const responses = await Promise.all([
    GETFees(jsonRequest("/api/saas/demosites/fees?order_id=order-1", "GET") as any),
    PATCHFees(jsonRequest("/api/saas/demosites/fees", "PATCH", { order_id: "order-1", setup_fee_nok: 7900 }) as any),
    GETImports(jsonRequest("/api/saas/demosites/imports?limit=25", "GET") as any),
    PATCHImports(jsonRequest("/api/saas/demosites/imports", "PATCH", { id: "import-1", status: "analyzed" }) as any),
    POSTLeadAudit(jsonRequest("/api/saas/demosites/leads/audit", "POST", { lead_id: "lead-1" }) as any),
    GETSetup(jsonRequest("/api/saas/demosites/setup?order_id=order-1", "GET") as any),
    PATCHSetup(jsonRequest("/api/saas/demosites/setup", "PATCH", { order_id: "order-1", hero_title: "Ny demo" }) as any),
    POSTUpload(jsonRequest("/api/saas/demosites/upload", "POST") as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
  assert.equal(called, false);
});
