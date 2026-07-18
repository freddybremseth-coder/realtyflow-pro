import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { setDemoSitesSupabaseFactoryForTests } from "@/lib/demosites-api-supabase";
import { POST } from "./route";

function request(token: string) {
  return new NextRequest("https://realtyflow.test/api/saas/demosites/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

test.beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  setDemoSitesSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  setDemoSitesSupabaseFactoryForTests(null);
});

test("DemoSites checkout fails closed instead of granting an unpaid claim", async () => {
  const order = {
    id: "00000000-0000-0000-0000-000000000001",
    status: "preview_ready",
    billing_status: "not_invoiced",
    company_name: "Testbedrift AS",
    customer_email: "kunde@example.com",
    package_id: "starter",
    setup_fee_nok: 1490,
    monthly_fee_nok: 490,
    claim_token: "valid-claim-token",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };

  setDemoSitesSupabaseFactoryForTests(() => ({
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: order, error: null }); },
      };
    },
  }));

  const response = await POST(request(order.claim_token) as any);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.error, /betaling er midlertidig utilgjengelig/i);
  assert.equal("fallback" in body, false);
});
