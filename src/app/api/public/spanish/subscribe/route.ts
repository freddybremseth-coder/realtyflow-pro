import { NextRequest } from "next/server";
import {
  requireSpanishUser,
  spanishJson,
  spanishPreflight,
} from "@/lib/spanish-api";

const STRIPE_API = "https://api.stripe.com/v1";
const SPANISH_URL = "https://spanish.chatgenius.pro";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const context = await requireSpanishUser(request);
  if ("error" in context) return context.error;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return spanishJson(request, { error: "Payment is not configured" }, 503);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const plan = body.plan === "yearly" ? "yearly" : "monthly";

  const { data: app, error: appError } = await context.supabase
    .from("saas_apps")
    .select("slug,name,price_monthly,price_yearly,currency,status")
    .eq("slug", "spanish")
    .maybeSingle();

  if (appError || !app || !["live", "beta"].includes(String(app.status))) {
    return spanishJson(request, { error: "Spanish subscription is unavailable" }, 503);
  }

  const amount = plan === "yearly" ? Number(app.price_yearly) : Number(app.price_monthly);
  if (!amount || amount <= 0) {
    return spanishJson(request, { error: "Spanish pricing is unavailable" }, 503);
  }

  const tenantId = String((context.ensured as any)?.tenant_id || "");
  if (!tenantId) return spanishJson(request, { error: "Spanish account is not ready" }, 500);

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.append("payment_method_types[]", "card");
  params.set("customer_email", context.user.email!);
  params.set("client_reference_id", context.user.id);
  params.set("allow_promotion_codes", "true");
  params.set("locale", "auto");
  params.set("success_url", `${SPANISH_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${SPANISH_URL}/?checkout=cancelled`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", String(app.currency || "EUR").toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
  params.set("line_items[0][price_data][recurring][interval]", plan === "yearly" ? "year" : "month");
  params.set("line_items[0][price_data][product_data][name]", `Spanish ChatGenius – ${plan === "yearly" ? "årsabonnement" : "månedsabonnement"}`);

  for (const [key, value] of Object.entries({
    app_slug: "spanish",
    plan,
    tenant_id: tenantId,
    user_id: context.user.id,
    customer_email: context.user.email!,
  })) {
    params.set(`metadata[${key}]`, value);
    params.set(`subscription_data[metadata][${key}]`, value);
  }

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await response.json()) as { url?: string; id?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    console.error("[Spanish Subscribe] Stripe error:", data.error?.message || response.status);
    return spanishJson(request, { error: "Could not start payment" }, 502);
  }

  return spanishJson(request, { url: data.url, session_id: data.id });
}

export async function OPTIONS(request: NextRequest) {
  return spanishPreflight(request);
}
