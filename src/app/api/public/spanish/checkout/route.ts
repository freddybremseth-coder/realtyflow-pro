import { NextRequest } from "next/server";
import {
  requireSpanishUser,
  spanishJson,
  spanishPreflight,
} from "@/lib/spanish-api";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeTimestamp(value: unknown) {
  const seconds = Number(value || 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

export async function GET(request: NextRequest) {
  const context = await requireSpanishUser(request);
  if ("error" in context) return context.error;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return spanishJson(request, { error: "Payment is not configured" }, 503);

  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId) return spanishJson(request, { error: "session_id is required" }, 400);

  const sessionResponse = await fetch(
    `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
    { headers: { Authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(20_000) },
  );
  const session = (await sessionResponse.json()) as any;

  if (!sessionResponse.ok || session.status !== "complete") {
    return spanishJson(request, { error: "Checkout is not complete" }, 409);
  }

  const sessionUserId = String(session.client_reference_id || session.metadata?.user_id || "");
  const checkoutEmail = String(session.customer_details?.email || session.customer_email || "").toLowerCase();
  if (
    (sessionUserId && sessionUserId !== context.user.id) ||
    (!sessionUserId && checkoutEmail !== context.user.email?.toLowerCase())
  ) {
    return spanishJson(request, { error: "Checkout does not belong to this account" }, 403);
  }

  const subscription = session.subscription;
  if (!subscription?.id) return spanishJson(request, { error: "Subscription is missing" }, 409);

  const tenantId = String(session.metadata?.tenant_id || subscription.metadata?.tenant_id || "");
  if (!tenantId) return spanishJson(request, { error: "Checkout tenant is missing" }, 409);

  const { data: bound, error: bindError } = await context.supabase.rpc("spanish_bind_stripe_subscription", {
    p_tenant_id: tenantId,
    p_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
    p_subscription_id: subscription.id,
    p_status: subscription.status,
    p_period_start: stripeTimestamp(subscription.current_period_start),
    p_period_end: stripeTimestamp(subscription.current_period_end),
    p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    p_billing_cycle:
      subscription.items?.data?.[0]?.price?.recurring?.interval === "year" ? "yearly" : "monthly",
  });

  if (bindError) {
    console.error("[Spanish Checkout] Bind error:", bindError);
    return spanishJson(request, { error: "Could not activate subscription" }, 500);
  }

  const { data: snapshot, error: snapshotError } = await context.supabase.rpc("spanish_account_snapshot", {
    p_user_id: context.user.id,
  });

  if (snapshotError) {
    return spanishJson(request, { checkout: bound });
  }

  return spanishJson(request, { checkout: bound, account: snapshot });
}

export async function OPTIONS(request: NextRequest) {
  return spanishPreflight(request);
}
