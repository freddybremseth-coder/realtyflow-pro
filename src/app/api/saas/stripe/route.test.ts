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

function signedStripeRequest(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  return stripeRequest(payload, `t=${timestamp},v1=${sign(payload, timestamp)}`);
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

test("Stripe webhook fails closed when the service-role database is unavailable", async () => {
  setSaasSupabaseFactoryForTests(() => null);

  const response = await POST(signedStripeRequest({
    id: "evt_no_database",
    type: "invoice.paid",
    data: { object: { id: "in_no_database" } },
  }) as any);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, "Supabase not configured");
});

test("Stripe webhook acknowledges an already claimed event without processing it twice", async () => {
  const calls: string[] = [];
  setSaasSupabaseFactoryForTests(() => ({
    rpc(name: string) {
      calls.push(name);
      return Promise.resolve({ data: false, error: null });
    },
  }));

  const response = await POST(signedStripeRequest({
    id: "evt_duplicate",
    type: "invoice.paid",
    data: { object: { id: "in_duplicate" } },
  }) as any);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { received: true, duplicate: true });
  assert.deepEqual(calls, ["saas_claim_stripe_event"]);
});

test("Stripe payment failure enters the billing lifecycle and completes the event", async () => {
  const calls: Array<{ name: string; payload?: Record<string, unknown> }> = [];
  setSaasSupabaseFactoryForTests(() => ({
    rpc(name: string, payload?: Record<string, unknown>) {
      calls.push({ name, payload });
      if (name === "saas_claim_stripe_event") return Promise.resolve({ data: true, error: null });
      if (name === "saas_sync_stripe_billing_state") {
        return Promise.resolve({ data: { tenantId: "tenant-1", legacyAppId: null }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  }));

  const response = await POST(signedStripeRequest({
    id: "evt_payment_failed",
    type: "invoice.payment_failed",
    livemode: true,
    data: { object: { id: "in_failed", subscription: "sub_failed", amount_due: 12500, currency: "eur" } },
  }) as any);

  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.name), [
    "saas_claim_stripe_event",
    "saas_sync_stripe_billing_state",
    "saas_complete_stripe_event",
  ]);
  assert.equal(calls[1].payload?.p_event_type, "invoice.payment_failed");
});

test("Stripe webhook marks a claimed event failed so Stripe can retry", async () => {
  const calls: string[] = [];
  setSaasSupabaseFactoryForTests(() => ({
    rpc(name: string) {
      calls.push(name);
      if (name === "saas_claim_stripe_event") return Promise.resolve({ data: true, error: null });
      if (name === "saas_sync_stripe_billing_state") {
        return Promise.resolve({ data: null, error: { message: "ledger unavailable" } });
      }
      return Promise.resolve({ data: null, error: null });
    },
  }));

  const response = await POST(signedStripeRequest({
    id: "evt_retry",
    type: "invoice.paid",
    data: { object: { id: "in_retry", subscription: "sub_retry" } },
  }) as any);

  assert.equal(response.status, 500);
  assert.deepEqual(calls, [
    "saas_claim_stripe_event",
    "saas_sync_stripe_billing_state",
    "saas_fail_stripe_event",
  ]);
});
