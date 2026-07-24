import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createDemoSiteCheckoutSession, verifyStripeSignature } from "@/lib/demosites-stripe";

function stripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

test("Stripe webhook signature verification accepts matching signatures", () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  assert.equal(verifyStripeSignature(payload, stripeSignature(payload, "secret"), "secret"), true);
  assert.equal(verifyStripeSignature(payload, stripeSignature(payload, "other"), "secret"), false);
});

test("DemoSites checkout session includes order metadata and recurring line item", async () => {
  const calls: Array<{ body: string }> = [];
  const session = await createDemoSiteCheckoutSession(
    {
      orderId: "order-1",
      claimToken: "token-1",
      companyName: "Demo AS",
      customerEmail: "kunde@example.com",
      packageName: "Standard",
      setupFeeNok: 7900,
      monthlyFeeNok: 990,
      baseUrl: "https://realtyflow.test",
    },
    {
      env: { STRIPE_SECRET_KEY: "sk_test_123" },
      fetchFn: (async (_url, init) => {
        calls.push({ body: String(init?.body || "") });
        return new Response(JSON.stringify({ id: "cs_test", url: "https://checkout.stripe.test/session" }), { status: 200 });
      }) as typeof fetch,
    },
  );

  assert.equal(session.url, "https://checkout.stripe.test/session");
  const body = new URLSearchParams(calls[0].body);
  assert.equal(body.get("mode"), "subscription");
  assert.equal(body.get("metadata[product]"), "demosites");
  assert.equal(body.get("metadata[order_id]"), "order-1");
  assert.equal(body.get("metadata[demosite_order_id]"), "order-1");
  assert.equal(body.get("line_items[0][price_data][recurring][interval]"), "month");
});
