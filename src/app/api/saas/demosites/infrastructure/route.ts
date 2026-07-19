import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { getDomainInfrastructureStatus } from "@/lib/demosites-domains";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Check = {
  configured: boolean;
  connected: boolean;
  message: string;
};

async function checkStripe(): Promise<Check> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { configured: false, connected: false, message: "STRIPE_SECRET_KEY mangler" };
  try {
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { configured: true, connected: false, message: `Stripe svarte HTTP ${response.status}` };
    const account = (await response.json()) as { id?: string; charges_enabled?: boolean; payouts_enabled?: boolean };
    return {
      configured: true,
      connected: Boolean(account.id),
      message: `Stripe-konto ${account.id || "ukjent"} · betalinger ${account.charges_enabled ? "aktivert" : "ikke aktivert"}`,
    };
  } catch (error) {
    return { configured: true, connected: false, message: error instanceof Error ? error.message : "Stripe kunne ikke kontaktes" };
  }
}

async function checkVercel(): Promise<Check> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID || "prj_qh1E3bxf4B4rDWO9WD8pcy8VCoGo";
  const teamId = process.env.VERCEL_TEAM_ID || "team_XggNkgEJvnbAunPA9w7BnIxT";
  if (!token) return { configured: false, connected: false, message: "VERCEL_TOKEN mangler" };
  try {
    const response = await fetch(`https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { configured: true, connected: false, message: `Vercel svarte HTTP ${response.status}` };
    const project = (await response.json()) as { name?: string; id?: string };
    return { configured: true, connected: true, message: `Vercel-prosjekt ${project.name || project.id || projectId}` };
  } catch (error) {
    return { configured: true, connected: false, message: error instanceof Error ? error.message : "Vercel kunne ikke kontaktes" };
  }
}

async function checkHostinger(): Promise<Check> {
  const token = process.env.HOSTINGER_API_TOKEN;
  const rootDomain = process.env.DEMOSITES_ROOT_DOMAIN || "chatgenius.pro";
  if (!token) return { configured: false, connected: false, message: "HOSTINGER_API_TOKEN mangler" };
  try {
    const response = await fetch(`https://developers.hostinger.com/api/dns/v1/zones/${rootDomain}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { configured: true, connected: false, message: `Hostinger DNS svarte HTTP ${response.status}` };
    return { configured: true, connected: true, message: `DNS-sonen ${rootDomain} er tilgjengelig via Hostinger API` };
  } catch (error) {
    return { configured: true, connected: false, message: error instanceof Error ? error.message : "Hostinger kunne ikke kontaktes" };
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getDemoSitesSupabase();
  const [stripe, vercel, hostinger] = await Promise.all([checkStripe(), checkVercel(), checkHostinger()]);
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const domainConfig = getDomainInfrastructureStatus();

  let paymentEvents = 0;
  let publishedEvents = 0;
  let lastPaymentAt: string | null = null;
  if (supabase) {
    const [{ count: paidCount }, { count: publishCount }, { data: lastPaid }] = await Promise.all([
      supabase.from("demo_site_order_events").select("id", { count: "exact", head: true }).eq("event_type", "demo_paid"),
      supabase.from("demo_site_order_events").select("id", { count: "exact", head: true }).eq("event_type", "demo_published"),
      supabase.from("demo_site_order_events").select("created_at").eq("event_type", "demo_paid").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    paymentEvents = paidCount || 0;
    publishedEvents = publishCount || 0;
    lastPaymentAt = lastPaid?.created_at || null;
  }

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    stripe: {
      ...stripe,
      webhook_configured: webhookConfigured,
      checkout_ready: stripe.connected && webhookConfigured,
    },
    vercel,
    hostinger,
    domains: {
      ...domainConfig,
      automatic_subdomains_ready: vercel.connected && hostinger.connected,
      custom_domains_ready: vercel.connected,
    },
    history: {
      successful_payment_events: paymentEvents,
      published_events: publishedEvents,
      last_payment_at: lastPaymentAt,
      end_to_end_proven: paymentEvents > 0 && publishedEvents > 0,
    },
  });
}
