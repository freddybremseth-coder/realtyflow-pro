import { NextRequest, NextResponse } from "next/server";
import { getPlatformSupabase } from "@/lib/platform/supabase";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get("token") || "").trim();
  if (!uuid.test(token)) return NextResponse.redirect(new URL("/", request.url));
  const supabase = getPlatformSupabase();
  if (!supabase) return NextResponse.redirect(new URL("/", request.url));

  const { data: link } = await supabase.schema("core").from("workspace_newsletter_links")
    .select("id,delivery_id,destination_url,click_count,clicked_at").eq("tracking_token", token).maybeSingle();
  if (!link) return NextResponse.redirect(new URL("/", request.url));

  let destination: URL;
  try {
    destination = new URL(link.destination_url);
    if (!["http:", "https:"].includes(destination.protocol)) throw new Error("invalid");
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const now = new Date().toISOString();
  await supabase.schema("core").from("workspace_newsletter_links").update({
    click_count: Number(link.click_count || 0) + 1,
    clicked_at: link.clicked_at || now,
  }).eq("id", link.id);

  const { data: delivery } = await supabase.schema("core").from("workspace_newsletter_deliveries")
    .select("id,campaign_id,clicked_at,click_count").eq("id", link.delivery_id).maybeSingle();
  if (delivery) {
    await supabase.schema("core").from("workspace_newsletter_deliveries").update({
      clicked_at: delivery.clicked_at || now,
      click_count: Number(delivery.click_count || 0) + 1,
    }).eq("id", delivery.id);
    if (!delivery.clicked_at) {
      const { data: campaign } = await supabase.schema("core").from("workspace_newsletter_campaigns")
        .select("clicked_count").eq("id", delivery.campaign_id).maybeSingle();
      await supabase.schema("core").from("workspace_newsletter_campaigns").update({
        clicked_count: Number(campaign?.clicked_count || 0) + 1,
        updated_at: now,
      }).eq("id", delivery.campaign_id);
    }
  }
  return NextResponse.redirect(destination);
}
