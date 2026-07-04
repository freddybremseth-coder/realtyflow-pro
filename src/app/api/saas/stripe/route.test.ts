import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";
import { setSaasSupabaseFactoryForTests } from "@/lib/saas-api-supabase";
import { POST } from "./route";

const SECRET = "whsec_route_test_secret";

function sign(payload: string, timestamp: number) {
  return createHmac("sha256", SECRET).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

function stripeRequest(payload: string, signature?: string) {
  return new NextRequest("https://realtyflow.test/api/saas/stripe", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: payload,
  });
}

test.beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  setSaasSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  setSaasSupabaseFactoryForTests(null);
});

test("Stripe webhook rejects unsigned requests before database access", async () => {
  let called = false;
  setSaasSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const response = await POST(stripeRequest(JSON.stringify({ id: "evt_unsigned", type: "invoice.paid" })) as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "Invalid Stripe webhook signature");
  assert.equal(called, false);
});

test("Stripe webhook rejects invalid JSON after signature verification but before database access", async () => {
  let called = false;
  setSaasSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });
  const payload = "not-json";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${sign(payload, timestamp)}`;

  const response = await POST(stripeRequest(payload, signature) as any);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "Invalid JSON");
  assert.equal(called, false);
});
