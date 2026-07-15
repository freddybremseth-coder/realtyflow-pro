/**
 * Stripe Checkout for DemoSites — the money moment.
 *
 * "Bestill siden nå" previously only flipped a status; invoicing was manual.
 * This creates a Checkout Session that charges the setup fee AND starts the
 * monthly subscription in one payment, so a customer can buy their trial
 * site at 22:00 on a Sunday with zero manual work.
 *
 * Plain Stripe REST (form-encoded) — no SDK dependency. The existing
 * webhook (/api/saas/stripe) marks the order paid on
 * checkout.session.completed via metadata.demosite_order_id.
 */

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export type DemoSiteCheckoutInput = {
  orderId: string;
  claimToken: string;
  companyName: string;
  customerEmail: string;
  packageName: string;
  setupFeeNok: number;
  monthlyFeeNok: number;
  baseUrl: string;
};

export type DemoSiteCheckoutSession = {
  id: string;
  url: string;
};

export async function createDemoSiteCheckoutSession(
  input: DemoSiteCheckoutInput,
): Promise<DemoSiteCheckoutSession> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");

  const claimUrl = `${input.baseUrl}/demosites/claim/${input.claimToken}`;
  const params = new URLSearchParams();

  params.set("mode", "subscription");
  params.set("customer_email", input.customerEmail);
  params.set("client_reference_id", input.orderId);
  params.set("allow_promotion_codes", "true");
  params.set("locale", "auto");
  params.set("success_url", `${claimUrl}?paid=1&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${claimUrl}?cancelled=1`);

  // Monthly subscription line.
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "nok");
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(input.monthlyFeeNok * 100)));
  params.set("line_items[0][price_data][recurring][interval]", "month");
  params.set("line_items[0][price_data][product_data][name]", `${input.packageName} – månedlig drift (${input.companyName})`);

  // One-time setup fee (allowed alongside recurring items in subscription mode).
  if (input.setupFeeNok > 0) {
    params.set("line_items[1][quantity]", "1");
    params.set("line_items[1][price_data][currency]", "nok");
    params.set("line_items[1][price_data][unit_amount]", String(Math.round(input.setupFeeNok * 100)));
    params.set("line_items[1][price_data][product_data][name]", `${input.packageName} – oppstart (${input.companyName})`);
  }

  // Metadata on both the session and the subscription so every later
  // webhook event can be traced back to the demo order.
  params.set("metadata[demosite_order_id]", input.orderId);
  params.set("metadata[claim_token]", input.claimToken);
  params.set("subscription_data[metadata][demosite_order_id]", input.orderId);
  params.set("subscription_data[metadata][company_name]", input.companyName);

  const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !data.url || !data.id) {
    throw new Error(data.error?.message || `Stripe checkout failed (HTTP ${res.status})`);
  }

  return { id: data.id, url: data.url };
}
