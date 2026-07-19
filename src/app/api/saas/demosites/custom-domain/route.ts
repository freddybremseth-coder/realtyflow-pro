import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import {
  inspectVercelDomain,
  normalizeCustomerDomain,
  provisionCustomerCustomDomain,
} from "@/lib/demosites-domains";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type OrderRow = {
  id: string;
  company_name: string;
  status: string;
  site_slug?: string | null;
  custom_domain?: string | null;
  production_url?: string | null;
  editable_fields?: Record<string, unknown> | null;
};

function getSupabase() {
  return getDemoSitesSupabase();
}

async function loadOrder(orderId: string) {
  const supabase = getSupabase();
  if (!supabase) return { supabase: null, order: null, error: "Supabase server key is not configured" };
  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, status, site_slug, custom_domain, production_url, editable_fields")
    .eq("id", orderId)
    .maybeSingle();
  return { supabase, order: data as OrderRow | null, error: error?.message || null };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const orderId = String(request.nextUrl.searchParams.get("order_id") || "").trim();
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  const { order, error } = await loadOrder(orderId);
  if (error || !order) return NextResponse.json({ error: error || "Order not found" }, { status: 404 });

  const domain = normalizeCustomerDomain(order.custom_domain);
  const inspection = domain ? await inspectVercelDomain(domain).catch((reason) => ({ ok: false, error: reason instanceof Error ? reason.message : "Domain check failed" })) : null;
  return NextResponse.json({
    order_id: order.id,
    status: order.status,
    site_slug: order.site_slug,
    custom_domain: domain,
    production_url: order.production_url,
    domain: inspection,
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.order_id || body.orderId || "").trim();
  const domain = normalizeCustomerDomain(body.custom_domain ?? body.customDomain);
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  if (!domain) return NextResponse.json({ error: "Skriv inn et gyldig domene, for eksempel www.bedriften.no." }, { status: 400 });

  const { supabase, order, error } = await loadOrder(orderId);
  if (!supabase) return NextResponse.json({ error: error || "Supabase unavailable" }, { status: 503 });
  if (error || !order) return NextResponse.json({ error: error || "Order not found" }, { status: 404 });
  if (order.status !== "deployed" || !order.site_slug) {
    return NextResponse.json({
      error: "Kundedomenet kan kobles til etter at siden er kjøpt og publisert. Bruk ChatGenius-preview frem til da.",
    }, { status: 409 });
  }

  const result = await provisionCustomerCustomDomain(domain);
  if (!result.ok) return NextResponse.json({ error: result.error || "Domain provisioning failed", domain: result }, { status: 400 });

  const currentFields = order.editable_fields && typeof order.editable_fields === "object" ? order.editable_fields : {};
  const domainSetup = {
    domain,
    configured: result.configured === true,
    verified: result.verified !== false,
    dns_records: result.dnsRecords || [],
    verification: result.verification || [],
    updated_at: new Date().toISOString(),
  };
  const patch: Record<string, unknown> = {
    custom_domain: domain,
    editable_fields: { ...currentFields, custom_domain_setup: domainSetup },
    updated_at: new Date().toISOString(),
  };
  if (result.configured) patch.production_url = `https://${domain}`;

  const { data: updated, error: updateError } = await supabase
    .from("demo_site_orders")
    .update(patch)
    .eq("id", orderId)
    .select("id, status, site_slug, custom_domain, production_url, editable_fields")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("demo_site_order_events").insert({
    order_id: orderId,
    event_type: result.configured ? "custom_domain_connected" : "custom_domain_pending_dns",
    title: result.configured ? "Kundedomenet er koblet til" : "Kundedomenet venter på DNS",
    description: result.configured
      ? `${domain} peker nå direkte til den publiserte DemoSites-siden.`
      : `${domain} er lagt til i Vercel. DNS-postene må oppdateres før domenet blir aktivt.`,
    metadata: domainSetup,
  });

  return NextResponse.json({ ok: true, order: updated, domain: result });
}
