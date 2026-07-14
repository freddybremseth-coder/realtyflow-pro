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

  const orders = ((data || []) as Array<Record<string, unknown>>).map((order) => {
    const previewUrl = String(order.preview_url || "");
    return {
      ...order,
      present_url: previewUrl.includes("/demosites/preview/")
        ? previewUrl.replace("/demosites/preview/", "/demosites/present/")
        : null,
    };
  });

  return portalJson(request, { orders, seller: { name: session.name, email: session.email } });
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
