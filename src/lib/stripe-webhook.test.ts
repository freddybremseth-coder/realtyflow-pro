import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyStripeWebhookSignature } from "./stripe-webhook";

function stripeSignature(payload: string, secret: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

test("Stripe webhook signature verification accepts a valid v1 signature", () => {
  const payload = JSON.stringify({ id: "evt_valid", type: "invoice.paid" });
  const secret = "whsec_test_secret";
  const timestamp = 1_800_000_000;
  const header = `t=${timestamp},v1=${stripeSignature(payload, secret, timestamp)}`;

  const result = verifyStripeWebhookSignature(payload, header, secret, timestamp * 1000);

  assert.deepEqual(result, { ok: true });
});

test("Stripe webhook signature verification rejects mismatched payloads", () => {
  const payload = JSON.stringify({ id: "evt_original" });
  const secret = "whsec_test_secret";
  const timestamp = 1_800_000_000;
  const header = `t=${timestamp},v1=${stripeSignature(payload, secret, timestamp)}`;

  const result = verifyStripeWebhookSignature(JSON.stringify({ id: "evt_modified" }), header, secret, timestamp * 1000);

  assert.deepEqual(result, { ok: false, reason: "signature-mismatch" });
});

test("Stripe webhook signature verification rejects stale timestamps", () => {
  const payload = JSON.stringify({ id: "evt_old" });
  const secret = "whsec_test_secret";
  const timestamp = 1_800_000_000;
  const header = `t=${timestamp},v1=${stripeSignature(payload, secret, timestamp)}`;

  const result = verifyStripeWebhookSignature(payload, header, secret, (timestamp + 301) * 1000);

  assert.deepEqual(result, { ok: false, reason: "stale-timestamp" });
});
