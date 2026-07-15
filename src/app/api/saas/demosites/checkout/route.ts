import { NextRequest, NextResponse } from "next/server";
import { getDemoSitePackage } from "@/lib/demosites";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { createDemoSiteCheckoutSession, isStripeConfigured } from "@/lib/demosites-stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";

/**
 * POST /api/saas/demosites/checkout   Body: { token }
 *
 * Public, claim-token-gated. Creates a Stripe Checkout Session (setup fee +
 * monthly subscription) for the order and returns its URL. When Stripe is
 * not configured the caller falls back to the old claim-without-payment
 * flow, so the button never dead-ends.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = String(body.token || "").trim();
    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

    const supabase = getDemoSitesSupabase();
    if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

    const { data: order } = await supabase
      .from("demo_site_orders")
      .select("id, status, billing_status, company_name, customer_email, package_id, setup_fee_nok, monthly_fee_nok, claim_token, expires_at")
      .eq("claim_token", token)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Fant ikke bestillingen." }, { status: 404 });
    if (order.billing_status === "paid") {
      return NextResponse.json({ error: "Denne siden er allerede betalt." }, { status: 409 });
    }
    if (order.status === "expired" || (order.expires_at && new Date(order.expires_at).getTime() < Date.now())) {
      return NextResponse.json({ error: "Prøveperioden er utløpt. Kontakt oss, så åpner vi den igjen." }, { status: 410 });
    }

    if (!isStripeConfigured()) {
      // Old behaviour still works — the button claims without payment.
      return NextResponse.json({ fallback: true });
    }

    const pkg = getDemoSitePackage(order.package_id);
    const seoAddon = body.seo_addon === true;
    const session = await createDemoSiteCheckoutSession({
      orderId: order.id,
      claimToken: order.claim_token,
      companyName: order.company_name,
      customerEmail: order.customer_email,
      packageName: pkg.shortName,
      setupFeeNok: Number(order.setup_fee_nok) || pkg.setupFeeNok,
      monthlyFeeNok: Number(order.monthly_fee_nok) || pkg.monthlyFeeNok,
      seoAddon,
      baseUrl: BASE_URL,
    });

    await supabase.from("demo_site_order_events").insert({
      order_id: order.id,
      event_type: "demo_checkout_started",
      title: "Kunde startet betaling",
      description: `Stripe Checkout åpnet for ${order.company_name} (${pkg.shortName}).`,
      metadata: { session_id: session.id, package_id: order.package_id, seo_addon: seoAddon },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[DemoSites Checkout] Error:", error);
    return NextResponse.json(
      { error: "Kunne ikke starte betalingen. Prøv igjen, eller kontakt oss." },
      { status: 500 },
    );
  }
}
