import { NextRequest } from "next/server";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { portalJson, portalPreflight, portalTokenFromRequest } from "@/lib/demosites-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/saas/demosites/portal/orders  (Bearer portal token, CORS)
 *
 * The seller dashboard on chatgenius.pro: every demo order with the links a
 * seller needs in the field — preview, presentation mode and the order/claim
 * link — plus contact info for follow-up. Scrubbed: no internal cost fields,
 * notes or provisioning logs.
 */
export async function GET(request: NextRequest) {
  const session = portalTokenFromRequest(request);
  if (!session) return portalJson(request, { error: "Ugyldig eller utløpt innlogging." }, 401);

  const supabase = getDemoSitesSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, order_number, company_name, customer_name, customer_email, customer_phone, industry, website_url, status, billing_status, package_id, preview_url, claim_url, expires_at, claimed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return portalJson(request, { error: "Kunne ikke hente prøvesider." }, 500);

  // Heat signals: views + inquiries per order so sellers call at the right
  // moment ("åpnet 7 ganger, sist for 2 timer siden").
  const orderIds = ((data || []) as Array<Record<string, unknown>>).map((o) => String(o.id));
  const heat = new Map<string, { views: number; lastViewedAt: string | null; inquiries: number }>();
  if (orderIds.length) {
    const { data: events } = await supabase
      .from("demo_site_order_events")
      .select("order_id, event_type, created_at")
      .in("order_id", orderIds)
      .in("event_type", ["demo_viewed", "demo_inquiry"])
      .order("created_at", { ascending: false })
      .limit(4000);
    for (const event of (events || []) as Array<Record<string, unknown>>) {
      const id = String(event.order_id);
      const entry = heat.get(id) || { views: 0, lastViewedAt: null, inquiries: 0 };
      if (event.event_type === "demo_viewed") {
        entry.views += 1;
        if (!entry.lastViewedAt) entry.lastViewedAt = String(event.created_at);
      } else {
        entry.inquiries += 1;
      }
      heat.set(id, entry);
    }
  }

  const orders = ((data || []) as Array<Record<string, unknown>>).map((order) => {
    const previewUrl = String(order.preview_url || "");
    const signals = heat.get(String(order.id)) || { views: 0, lastViewedAt: null, inquiries: 0 };
    return {
      ...order,
      present_url: previewUrl.includes("/demosites/preview/")
        ? previewUrl.replace("/demosites/preview/", "/demosites/present/")
        : null,
      views: signals.views,
      last_viewed_at: signals.lastViewedAt,
      inquiries: signals.inquiries,
    };
  });

  return portalJson(request, { orders, seller: { name: session.name, email: session.email } });
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
