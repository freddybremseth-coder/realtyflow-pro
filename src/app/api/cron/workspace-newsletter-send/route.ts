import { NextRequest, NextResponse } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { sendWorkspaceNewsletterCampaign } from "@/lib/workspaces/newsletter-send";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;
  const supabase = getPlatformSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "UNAVAILABLE" }, { status: 503 });

  const now = new Date().toISOString();
  const { data: campaigns, error } = await supabase.schema("core").from("workspace_newsletter_campaigns")
    .select("id,brand_id,scheduled_at").eq("status", "scheduled").lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true }).limit(10);
  if (error) return NextResponse.json({ ok: false, error: "QUERY_FAILED" }, { status: 503 });

  const results = [];
  const origin = new URL(request.url).origin;
  for (const campaign of campaigns || []) {
    const { data: claimed } = await supabase.schema("core").from("workspace_newsletter_campaigns")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", campaign.id).eq("status", "scheduled")
      .select("id").maybeSingle();
    if (!claimed) {
      results.push({ id: campaign.id, ok: false, code: "ALREADY_CLAIMED" });
      continue;
    }
    const { data: brand } = await supabase.schema("core").from("brands")
      .select("brand_key").eq("id", campaign.brand_id).maybeSingle();
    if (!brand?.brand_key) {
      await supabase.schema("core").from("workspace_newsletter_campaigns").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", campaign.id);
      results.push({ id: campaign.id, ok: false, code: "BRAND_NOT_FOUND" });
      continue;
    }
    const result = await sendWorkspaceNewsletterCampaign({
      supabase,
      brandId: campaign.brand_id,
      brandKey: brand.brand_key,
      campaignId: campaign.id,
      origin,
    });
    if (!result.ok) await supabase.schema("core").from("workspace_newsletter_campaigns").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", campaign.id);
    results.push({ id: campaign.id, ...result });
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
