import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { GET as GETNurtureOverview } from "./overview/route";
import { GET as GETNurtureRun } from "./run/route";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "nurture-admin-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.CRON_SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test("nurture admin routes require an admin session before database access", async () => {
  const responses = await Promise.all([
    GETNurtureOverview(request("/api/nurture/overview") as any),
    GETNurtureRun(request("/api/nurture/run?dry=1") as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});

test("nurture admin run accepts admin sessions without CRON_SECRET", async () => {
  const token = await createAdminSession("freddy.bremseth@gmail.com");

  const response = await GETNurtureRun(
    request("/api/nurture/run?dry=1", `realtyflow_admin=${token}`) as any,
  );

  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.error, "Supabase not configured");
});
