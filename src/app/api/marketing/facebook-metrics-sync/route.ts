import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { growthBrandDefinition, isPilotChannel } from "@/lib/marketing/brand-registry";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { syncGrowthFacebookMetrics } from "@/services/marketing/growth-facebook-metrics-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const brandId = typeof body?.brandId === "string" ? body.brandId.trim() : "";
    if (!brandId) return NextResponse.json({ error: "brandId er påkrevd" }, { status: 400 });

    const definition = growthBrandDefinition(brandId);
    if (!definition) {
      return NextResponse.json({ error: "BRAND_NOT_IN_GROWTH_REGISTRY", brandId }, { status: 409 });
    }
    if (!isPilotChannel(brandId, "facebook")) {
      return NextResponse.json({ error: "FACEBOOK_NOT_PILOT_READY", brandId }, { status: 409 });
    }

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const days = Math.max(1, Math.min(Number(body?.days ?? 30), 90));
    const limit = Math.max(1, Math.min(Number(body?.limit ?? 100), 250));
    const minAgeHours = Math.max(24, Math.min(Number(body?.minAgeHours ?? 24), 168));
    const learningMinObservations = Math.max(10, Number(body?.learningMinObservations ?? 10));

    const result = await syncGrowthFacebookMetrics(supabase, {
      brandId,
      days,
      limit,
      minAgeHours,
      learningMinObservations,
    });

    return NextResponse.json({
      ok: true,
      scheduled: false,
      config: { brandId, channel: "facebook", days, limit, minAgeHours, learningMinObservations },
      result,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
