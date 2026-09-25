import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { GET, POST } from "./route";

test("legacy all-brand internal-alerts endpoint denies staff before querying any customer/task data", async () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    secret: process.env.REALTYFLOW_SESSION_SECRET,
    emails: process.env.REALTYFLOW_ADMIN_EMAILS,
    fetch: globalThis.fetch,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://internal-alerts-no-database.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-internal-alerts-test-key";
  process.env.REALTYFLOW_SESSION_SECRET = "isolated-alerts-session";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    throw new Error("A workspace member must never query global contacts, alerts or settings");
  }) as typeof fetch;
  try {
    const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
    const read = await GET(new NextRequest(
      "https://realtyflow.test/api/internal-alerts", { headers: { cookie } },
    ));
    assert.equal(read.status, 403);
    assert.equal((await read.json()).center, null);
    const write = await POST(new NextRequest("https://realtyflow.test/api/internal-alerts", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        action: "ACKNOWLEDGE", alertId: "SOME_LEGACY_ALERT", fingerprint: "abcdef12",
      }),
    }));
    assert.equal(write.status, 403);
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [
      ["NEXT_PUBLIC_SUPABASE_URL", previous.url],
      ["SUPABASE_SERVICE_ROLE_KEY", previous.key],
      ["REALTYFLOW_SESSION_SECRET", previous.secret],
      ["REALTYFLOW_ADMIN_EMAILS", previous.emails],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
