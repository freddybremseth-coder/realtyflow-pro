import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
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
  const session = await verifyAdminSession(request.cookies.get("admin_session")?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    .select("id, company_name, industry, website_url, template_slug, brand_color, notes, editable_fields, extracted_profile")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const result = await enrichDemoSiteOrder(supabase, order, {
      generateImages: body.generate_images !== false,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichment failed" },
      { status: 500 },
    );
  }
}
