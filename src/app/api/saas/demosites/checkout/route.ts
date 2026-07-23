import { NextRequest, NextResponse } from "next/server";
import { getDemoSitePackage } from "@/lib/demosites";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { createDemoSiteCheckoutSession, isStripeConfigured } from "@/lib/demosites-stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";

type CheckoutOrder = {
  id: string;
  status: string;
  billing_status: string;
  company_name: string;
  customer_email: string;
  package_id: string;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  claim_token: string;
  expires_at?: string | null;
  provisioning_log?: unknown[] | null;
};

function appendCheckoutLog(order: CheckoutOrder) {
  const current = Array.isArray(order.provisioning_log) ? order.provisioning_log : [];
  return [
    ...current,
    {
      at: new Date().toISOString(),
      type: "stripe_checkout_started",
      message: "Kunden åpnet Stripe Checkout fra DemoSites claim-side.",
    },
  ].slice(-25);
}

function safeToken(value: unknown) {
  const token = String(value || "").trim();
  if (!token || token.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(token)) return "";
  return token;
}

/**
 * POST /api/saas/demosites/checkout   Body: { token }
 *
 * Public, claim-token-gated. Creates a Stripe Checkout Session (setup fee +
 * monthly subscription) for the order and returns its URL. When Stripe is
 * not configured the endpoint fails closed. A customer must never receive a
 * paid product merely because the payment provider is unavailable.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = safeToken(body.token);
    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

    const supabase = getDemoSitesSupabase();
    if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

    const { data: order, error: orderError } = await supabase
      .from("demo_site_orders")
      .select("id, status, billing_status, company_name, customer_email, package_id, setup_fee_nok, monthly_fee_nok, claim_token, expires_at, provisioning_log")
      .eq("claim_token", token)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: "Fant ikke bestillingen." }, { status: 404 });
    const checkoutOrder = order as CheckoutOrder;
    if (checkoutOrder.billing_status === "paid") {
      return NextResponse.json({ error: "Denne siden er allerede betalt.", already_paid: true }, { status: 409 });
    }
    if (checkoutOrder.status === "expired" || (checkoutOrder.expires_at && new Date(checkoutOrder.expires_at).getTime() < Date.now())) {
      return NextResponse.json({ error: "Prøveperioden er utløpt. Kontakt oss, så åpner vi den igjen." }, { status: 410 });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Betaling er midlertidig utilgjengelig. Kontakt oss, så hjelper vi deg." },
        { status: 503 },
      );
    }

    const pkg = getDemoSitePackage(checkoutOrder.package_id);
    const seoAddon = body.seo_addon === true;
    const session = await createDemoSiteCheckoutSession({
      orderId: checkoutOrder.id,
      claimToken: checkoutOrder.claim_token,
      companyName: checkoutOrder.company_name,
      customerEmail: checkoutOrder.customer_email,
      packageName: pkg.shortName,
      setupFeeNok: Number(checkoutOrder.setup_fee_nok) || pkg.setupFeeNok,
      monthlyFeeNok: Number(checkoutOrder.monthly_fee_nok) || pkg.monthlyFeeNok,
      seoAddon,
      baseUrl: BASE_URL,
    });

    const update = await supabase
      .from("demo_site_orders")
      .update({
        billing_status: "pending",
        provisioning_log: appendCheckoutLog(checkoutOrder),
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkoutOrder.id);
    if (update.error) throw update.error;

    const { error: eventError } = await supabase.from("demo_site_order_events").insert({
      order_id: checkoutOrder.id,
      event_type: "demo_checkout_started",
      title: "Kunde startet betaling",
      description: `Stripe Checkout åpnet for ${checkoutOrder.company_name} (${pkg.shortName}).`,
      metadata: { session_id: session.id, package_id: checkoutOrder.package_id, seo_addon: seoAddon },
    });
    if (eventError) throw new Error(`Kunne ikke loggføre checkout: ${eventError.message}`);

    return NextResponse.json({ url: session.url, checkout_url: session.url, checkout_session_id: session.id });
  } catch (error) {
    console.error("[DemoSites Checkout] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke starte betalingen. Prøv igjen, eller kontakt oss." },
      { status: 500 },
    );
  }
}
