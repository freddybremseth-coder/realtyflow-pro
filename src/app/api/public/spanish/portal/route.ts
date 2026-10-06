import { NextRequest } from "next/server";
import {
  requireSpanishUser,
  spanishJson,
  spanishPreflight,
} from "@/lib/spanish-api";

const STRIPE_API = "https://api.stripe.com/v1";
const SPANISH_URL = "https://spanish.chatgenius.pro";

export async function POST(request: NextRequest) {
  const context = await requireSpanishUser(request);
  if ("error" in context) return context.error;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return spanishJson(request, { error: "Payment is not configured" }, 503);

  const { data: snapshot, error } = await context.supabase.rpc("spanish_account_snapshot", {
    p_user_id: context.user.id,
  });
  if (error) return spanishJson(request, { error: "Could not load subscription" }, 500);

  const customerId = String((snapshot as any)?.subscription?.external_customer_id || "");
  if (!customerId) return spanishJson(request, { error: "No Stripe subscription found" }, 409);

  const params = new URLSearchParams({
    customer: customerId,
    return_url: SPANISH_URL,
  });

  const response = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json()) as { url?: string; error?: { message?: string } };

  if (!response.ok || !data.url) {
    return spanishJson(request, { error: data.error?.message || "Could not open billing portal" }, 502);
  }

  return spanishJson(request, { url: data.url });
}

export async function OPTIONS(request: NextRequest) {
  return spanishPreflight(request);
}
