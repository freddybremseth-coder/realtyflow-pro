import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { publishDemoSiteOrder } from "@/lib/demosites-publish";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/saas/demosites/publish   Body: { order_id, force? }
 *
 * Manual publish/republish from the CRM. Paid orders publish directly;
 * `force` covers manually invoiced customers. Stripe-paid orders publish
 * automatically via the webhook — this is the override/rescue path.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getDemoSitesSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.order_id || "").trim();
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const result = await publishDemoSiteOrder(supabase, orderId, { force: body.force === true });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
