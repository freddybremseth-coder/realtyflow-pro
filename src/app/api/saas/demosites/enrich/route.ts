import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { enrichDemoSiteOrder } from "@/lib/demosites-enrichment";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/**
 * POST /api/saas/demosites/enrich   Body: { order_id }
 *
 * Admin/seller action: (re)enrich an existing demo with real content —
 * snapshot of the customer's old site, AI-written copy and AI-generated
 * gallery images. Used from the DemoSites CRM before a physical customer
 * visit, and to refresh demos created before enrichment existed.
 */
export async function POST(request: NextRequest) {
  // Same auth as the rest of the DemoSites admin APIs (realtyflow_admin
  // session cookie / access roles) — the first version read a non-existent
  // cookie name and rejected every request with 401.
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.order_id || body.orderId || "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  }

  const supabase = getDemoSitesSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });
  }

  const { data: order, error } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, package_id, industry, website_url, template_slug, brand_color, notes, editable_fields, extracted_profile")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const result = await enrichDemoSiteOrder(supabase, order, {
      generateImages: body.generate_images !== false,
      regenerateImages: body.regenerate_images === true,
      imagesOnly: body.images_only === true,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichment failed" },
      { status: 500 },
    );
  }
}
