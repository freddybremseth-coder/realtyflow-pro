import { NextRequest, NextResponse } from "next/server";
import { getPlatformSupabase } from "@/lib/platform/supabase";

export const dynamic = "force-dynamic";
const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get("token") || "").trim();
  const supabase = getPlatformSupabase();
  if (supabase && uuid.test(token)) {
    const now = new Date().toISOString();
    const { data: delivery } = await supabase.schema("core").from("workspace_newsletter_deliveries")
      .select("id,campaign_id,opened_at,open_count").eq("tracking_token", token).maybeSingle();
    if (delivery) {
      await supabase.schema("core").from("workspace_newsletter_deliveries").update({
        opened_at: delivery.opened_at || now,
        open_count: Number(delivery.open_count || 0) + 1,
      }).eq("id", delivery.id);
      if (!delivery.opened_at) {
        const { data: campaign } = await supabase.schema("core").from("workspace_newsletter_campaigns")
          .select("opened_count").eq("id", delivery.campaign_id).maybeSingle();
        await supabase.schema("core").from("workspace_newsletter_campaigns")
          .update({ opened_count: Number(campaign?.opened_count || 0) + 1, updated_at: now })
          .eq("id", delivery.campaign_id);
      }
    }
  }
  return new NextResponse(pixel, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" },
  });
}
