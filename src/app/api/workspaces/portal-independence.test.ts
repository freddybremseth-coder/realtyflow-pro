import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { GET as getMessages, POST as postMessages } from "@/app/api/portal/messages/route";
import { GET as getDocuments } from "@/app/api/portal/documents/route";

test("workspace member cookie alone cannot act as an independent customer portal bearer", async () => {
  const original = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    secret: process.env.REALTYFLOW_SESSION_SECRET,
    emails: process.env.REALTYFLOW_ADMIN_EMAILS,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://portal-auth-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "only-a-test-key";
  process.env.REALTYFLOW_SESSION_SECRET = "independent-portal-auth-test";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  try {
    const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
    const messages = new NextRequest("https://realtyflow.test/api/portal/messages", { headers: { cookie } });
    const documents = new NextRequest("https://realtyflow.test/api/portal/documents", { headers: { cookie } });
    const send = new NextRequest("https://realtyflow.test/api/portal/messages", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ body: "Try to access private portal using only staff session" }),
    });
    assert.equal((await getMessages(messages)).status, 401);
    assert.equal((await getDocuments(documents)).status, 401);
    assert.equal((await postMessages(send)).status, 401);
  } finally {
    for (const [key, value] of [
      ["NEXT_PUBLIC_SUPABASE_URL", original.url],
      ["SUPABASE_SERVICE_ROLE_KEY", original.key],
      ["REALTYFLOW_SESSION_SECRET", original.secret],
      ["REALTYFLOW_ADMIN_EMAILS", original.emails],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
