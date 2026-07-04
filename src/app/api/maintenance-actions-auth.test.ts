import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as POSTAreaProfilesMigrate } from "./area-profiles/migrate/route";
import { POST as POSTContactsMigrate } from "./contacts/migrate/route";
import { POST as POSTPortalMigrate } from "./portal/migrate/route";
import { POST as POSTBrandVisibilityRebuild } from "./properties/brand-visibility/rebuild/route";
import { POST as POSTWorkItemsCleanup } from "./work-items/cleanup/route";

function jsonRequest(path: string, body: Record<string, unknown> = {}) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "maintenance-actions-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test("maintenance and migration actions require admin session before database access", async () => {
  const responses = await Promise.all([
    POSTContactsMigrate(jsonRequest("/api/contacts/migrate") as any),
    POSTAreaProfilesMigrate(jsonRequest("/api/area-profiles/migrate") as any),
    POSTPortalMigrate(jsonRequest("/api/portal/migrate") as any),
    POSTBrandVisibilityRebuild(jsonRequest("/api/properties/brand-visibility/rebuild") as any),
    POSTWorkItemsCleanup(jsonRequest("/api/work-items/cleanup", { includeDone: false }) as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});
