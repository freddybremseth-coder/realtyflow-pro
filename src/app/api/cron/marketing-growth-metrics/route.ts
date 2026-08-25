export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { syncGrowthInstagramMetrics } from "@/services/marketing/growth-metrics-sync";
import { resolveBrandInstagramAccessToken } from "@/services/marketing/instagram-token";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/marketing-growth-metrics");
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    // Pilot stays intentionally brand-scoped. Expansion to more brands is an
    // explicit config change after Zen Eco Homes has enough observations.
    const brandId = process.env.MARKETING_METRICS_PILOT_BRAND || "zeneco";
    const days = Number(process.env.MARKETING_METRICS_LOOKBACK_DAYS || 30);
    const limit = Number(process.env.MARKETING_METRICS_LIMIT || 100);
    const minAgeHours = Number(process.env.MARKETING_METRICS_MIN_AGE_HOURS || 24);
    const learningMinObservations = Number(process.env.MARKETING_LEARNING_MIN_OBSERVATIONS || 10);
    const instagram = await resolveBrandInstagramAccessToken(brandId);

    const result = await syncGrowthInstagramMetrics(supabase as any, {
      brandId,
      days,
      limit,
      minAgeHours,
      learningMinObservations,
      accessToken: instagram.accessToken,
    });

    return NextResponse.json({
      success: true,
      config: {
        brandId,
        days,
        limit,
        minAgeHours,
        learningMinObservations,
        instagramChannelId: instagram.channelId,
        instagramAccountId: instagram.accountId,
        tokenScope: "brand_channel",
      },
      ...result,
    });
  } catch (error) {
    console.error("[Marketing Growth Metrics]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Growth metrics sync failed" },
      { status: 500 },
    );
  }
}