import { NextRequest, NextResponse } from "next/server";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { provisionDemoSiteAfterPayment, type DemoSiteProvisioningOrder } from "@/lib/demosites-provisioning";
import { verifyStripeSignature } from "@/lib/demosites-stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

function metadataValue(object: Record<string, unknown>, key: string) {
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return String((metadata as Record<string, unknown>)[key] || "").trim();
}

async function handleCheckoutCompleted(session: Record<string, unknown>) {
  const orderId = metadataValue(session, "order_id") || metadataValue(session, "demosite_order_id");
  if (metadataValue(session, "product") !== "demosites" && !orderId) {
    return { ignored: true, reason: "not_demosites" };
  }

  if (!orderId) throw new Error("Stripe Checkout mangler DemoSites order_id.");

  const supabase = getDemoSitesSupabase();
  if (!supabase) throw new Error("Supabase server key is not configured");

  const { data, error } = await supabase.from("demo_site_orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Fant ikke DemoSites-ordren for betalt Stripe Checkout.");

  const order = data as DemoSiteProvisioningOrder;
  const paymentLog = Array.isArray(order.provisioning_log) ? order.provisioning_log : [];
  const paidLog = [
    ...paymentLog,
    {
      at: new Date().toISOString(),
      type: "stripe_payment_completed",
      message: "Stripe bekreftet betaling. Starter Hostinger-oppretting.",
      stripe_session_id: session.id || null,
    },
  ].slice(-25);

  const paidUpdate = await supabase
    .from("demo_site_orders")
    .update({
      billing_status: "paid",
      status: order.status === "deployed" ? "deployed" : "approved",
      approved_at: new Date().toISOString(),
      provisioning_log: paidLog,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .select("*")
    .single();

  if (paidUpdate.error) throw paidUpdate.error;

  const provisioned = await provisionDemoSiteAfterPayment(
    supabase,
    paidUpdate.data as DemoSiteProvisioningOrder,
    "stripe_checkout_completed",
  );

  let publishResult: unknown = null;
  try {
    const { publishDemoSiteOrder } = await import("@/lib/demosites-publish");
    publishResult = await publishDemoSiteOrder(supabase, order.id);
  } catch (publishError) {
    publishResult = {
      ok: false,
      error: publishError instanceof Error ? publishError.message : "DemoSites publish failed",
    };
  }

  await supabase.from("demo_site_order_events").insert({
    order_id: order.id,
    event_type: "payment_paid",
    title: "Betaling mottatt",
    description: provisioned.result.message,
    metadata: {
      stripe_session_id: session.id || null,
      hostinger: provisioned.result,
      publish: publishResult,
    },
  });

  return { ignored: false, provisioning: provisioned.result, publish: publishResult };
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_DEMOSITES_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook secret mangler." }, { status: 503 });
  }
  if (!verifyStripeSignature(payload, signature, webhookSecret)) {
    return NextResponse.json({ error: "Ugyldig Stripe-signatur." }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as StripeEvent;
    if (event.type === "checkout.session.completed" && event.data?.object) {
      const result = await handleCheckoutCompleted(event.data.object);
      return NextResponse.json({ received: true, ...result });
    }

    return NextResponse.json({ received: true, ignored: true, type: event.type || "unknown" });
  } catch (error) {
    console.error("DemoSites Stripe webhook failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke behandle Stripe webhook." },
      { status: 500 },
    );
  }
}
