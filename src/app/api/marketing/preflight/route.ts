import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { preflightLiveCampaign, type PreflightInput } from "@/services/marketing/preflight-live-campaign";
import {
  deriveSpecificLocationFromDescription,
  deriveSpecificLocationFromTitle,
  isBroadInventoryRegion,
} from "@/services/marketing/inventory-property-adapter";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  await getRequestAccessContext(request);

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as Partial<PreflightInput>;
  if (!body.brandId || !body.channel || (!body.contentHubItemId && !body.aiMode)) {
    return NextResponse.json({ error: "brandId, channel og (contentHubItemId eller aiMode) er påkrevd" }, { status: 400 });
  }

  const result = await preflightLiveCampaign(
    {
      supabase,
      approvalConfigured: true,
      env: {
        autopilotEnabled: process.env.MARKETING_AUTOPILOT_ENABLED !== "false",
        metaLive: process.env.MARKETING_META_LIVE === "true",
        metaToken: process.env.META_ACCESS_TOKEN,
        igUserId: process.env.META_IG_USER_ID,
        pageId: process.env.META_PAGE_ID,
        anthropicKey: process.env.ANTHROPIC_API_KEY,
      },
    },
    {
      brandId: body.brandId,
      channel: body.channel,
      contentHubItemId: body.contentHubItemId,
      aiMode: body.aiMode,
      mode: body.mode === "live" ? "live" : "dry_run",
      service: body.service,
      market: body.market,
      language: body.language,
      publishingAccountId: body.publishingAccountId,
      mediaUrl: body.mediaUrl,
      cta: body.cta,
      useInventoryProperty: body.useInventoryProperty,
      propertyId: body.propertyId,
    },
  );

  // Fail closed for live Inventory-grounded property posts when the selected row
  // only knows a broad region. Concrete town/area is part of the customer-facing
  // property fact set and must be resolved before draft/hash/approval.
  if (
    body.mode === "live" &&
    body.aiMode &&
    body.useInventoryProperty &&
    result.inventoryProperty?.id
  ) {
    const { data: property } = await supabase
      .from("properties")
      .select("id, ref, location, title, title_no, description, description_no")
      .eq("id", result.inventoryProperty.id)
      .maybeSingle();

    if (property) {
      const rawLocation = String(property.location ?? "").trim();
      const derivedLocation = isBroadInventoryRegion(rawLocation)
        ? deriveSpecificLocationFromTitle(property.title_no || property.title)
          || deriveSpecificLocationFromDescription(property.description_no || property.description)
        : rawLocation;

      const locationOk = !!derivedLocation && !isBroadInventoryRegion(derivedLocation);
      result.checks.push({
        name: "property_location",
        critical: true,
        status: locationOk ? "ok" : "fail",
        detail: locationOk
          ? `konkret sted verifisert: ${derivedLocation}`
          : `INVENTORY_PROPERTY_LOCATION_TOO_BROAD: ${rawLocation || "mangler"} — konkret by/område må være verifisert før live property-post`,
      });

      if (!locationOk) {
        result.criticalFailures.push(
          `property_location: konkret by/område mangler for ${property.ref ?? property.id}`,
        );
        result.status = "NOT_READY";
      }
    }
  }

  return NextResponse.json(result);
}
