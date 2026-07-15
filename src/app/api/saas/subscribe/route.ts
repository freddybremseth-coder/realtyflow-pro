import { NextRequest } from "next/server";
import { getSaasSupabase } from "@/lib/saas-api-supabase";
import { portalCorsHeaders, portalJson, portalPreflight } from "@/lib/demosites-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHATGENIUS_BASE = "https://www.chatgenius.pro";

/**
 * Public subscription API for the chatgenius.pro apps (Astro, Family,
 * Spanish, …). Same Stripe pipeline as DemoSites:
 *
 *   GET             → subscribable apps with live pricing from saas_apps
 *   POST {app_slug, plan, customer_email?}
 *                   → Stripe Checkout subscription session
 *
 * The existing webhook (/api/saas/stripe) already tracks
 * checkout.session.completed with metadata.app_slug — signups and user
 * counts land in the SaaS metrics automatically.
 */

type SaasAppRow = {
  slug: string;
  name: string;
  description: string | null;
  status: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string | null;
  live_url: string | null;
  screenshot_url: string | null;
  category: string | null;
};

export async function GET(request: NextRequest) {
  const supabase = getSaasSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const { data, error } = await supabase
    .from("saas_apps")
    .select("slug, name, description, status, price_monthly, price_yearly, currency, live_url, screenshot_url, category")
    .in("status", ["live", "beta"])
    .order("name");

  if (error) return portalJson(request, { error: error.message }, 500);

  const apps = ((data || []) as SaasAppRow[]).map((app) => ({
    ...app,
    subscribable: Boolean(app.price_monthly && app.price_monthly > 0),
  }));

  return portalJson(request, { apps });
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return portalJson(request, { error: "Betaling er ikke konfigurert ennå." }, 503);

  const supabase = getSaasSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const appSlug = String(body.app_slug || "").trim().toLowerCase();
  const plan = body.plan === "yearly" ? "yearly" : "monthly";
  const customerEmail = String(body.customer_email || "").trim();

  if (!appSlug) return portalJson(request, { error: "app_slug er påkrevd." }, 400);

  const { data: app } = await supabase
    .from("saas_apps")
    .select("slug, name, price_monthly, price_yearly, currency, status")
    .eq("slug", appSlug)
    .maybeSingle();

  if (!app || !["live", "beta"].includes(String(app.status)))
    return portalJson(request, { error: "Fant ikke appen." }, 404);

  const amount = plan === "yearly" ? Number(app.price_yearly) : Number(app.price_monthly);
  if (!amount || amount <= 0) {
    return portalJson(request, { error: "Denne appen har ikke selvbetjent abonnement ennå — kontakt post@chatgenius.pro." }, 409);
  }

  const currency = String(app.currency || "NOK").toLowerCase();
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.append("payment_method_types[]", "card");
  if (customerEmail && customerEmail.includes("@")) params.set("customer_email", customerEmail);
  params.set("allow_promotion_codes", "true");
  params.set("locale", "auto");
  params.set("success_url", `${CHATGENIUS_BASE}/apper/?subscribed=${encodeURIComponent(app.slug)}`);
  params.set("cancel_url", `${CHATGENIUS_BASE}/apper/`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", currency);
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
  params.set("line_items[0][price_data][recurring][interval]", plan === "yearly" ? "year" : "month");
  params.set("line_items[0][price_data][product_data][name]", `${app.name} – ${plan === "yearly" ? "årsabonnement" : "månedsabonnement"}`);
  // The existing webhook keys SaaS metrics off app_slug.
  params.set("metadata[app_slug]", app.slug);
  params.set("metadata[plan]", plan);
  params.set("subscription_data[metadata][app_slug]", app.slug);

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !data.url) throw new Error(data.error?.message || `Stripe feilet (HTTP ${res.status})`);
    return portalJson(request, { url: data.url });
  } catch (error) {
    console.error("[SaaS Subscribe] Error:", error);
    return portalJson(request, { error: "Kunne ikke starte betalingen. Prøv igjen eller kontakt oss." }, 500);
  }
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
