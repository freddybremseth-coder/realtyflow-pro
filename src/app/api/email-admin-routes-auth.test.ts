import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as POSTEmailConnectionCheck } from "./email/connection-check/route";
import { POST as POSTEmailConnectionRepair } from "./email/connection-repair/route";
import { DELETE as DELETEEmailConfig, GET as GETEmailConfig, POST as POSTEmailConfig } from "./email/config/route";
import { POST as POSTEmailBackfill } from "./email/inbox/backfill/route";
import { GET as GETEmailInbox, POST as POSTEmailInbox } from "./email/inbox/route";

function request(path: string, method: "GET" | "POST" | "DELETE", body?: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "email-admin-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test("email config, inbox, connection check, connection repair and history backfill routes require admin session before database or IMAP access", async () => {
  const responses = await Promise.all([
    GETEmailConfig(request("/api/email/config", "GET") as any),
    POSTEmailConfig(request("/api/email/config", "POST", { brand_id: "soleada", email_address: "test@example.com" }) as any),
    DELETEEmailConfig(request("/api/email/config?id=test", "DELETE") as any),
    GETEmailInbox(request("/api/email/inbox?brand_id=soleada", "GET") as any),
    POSTEmailInbox(request("/api/email/inbox", "POST", { brand_id: "soleada" }) as any),
    POSTEmailConnectionCheck(request("/api/email/connection-check", "POST", { accountId: "test" }) as any),
    POSTEmailConnectionRepair(request("/api/email/connection-repair", "POST", { accountId: "test", confirm: "REPAIR_EMAIL_CONNECTION" }) as any),
    POSTEmailBackfill(request("/api/email/inbox/backfill", "POST", { brand_id: "soleada" }) as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});
