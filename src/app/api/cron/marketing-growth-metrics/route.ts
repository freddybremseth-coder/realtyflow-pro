export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { syncGrowthInstagramMetrics } from "@/services/marketing/growth-metrics-sync";
import { syncGrowthFacebookMetrics } from "@/services/marketing/growth-facebook-metrics-sync";
import { enrichPublishedGrowthGenomes } from "@/services/marketing/growth-genome-enrichment";
import { resolveBrandInstagramAccessToken } from "@/services/marketing/instagram-token";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
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
    const brandId = process.env.MARKETING_METRICS_PILOT_BRAND || "zeneco";
    const days = Number(process.env.MARKETING_METRICS_LOOKBACK_DAYS || 30);
    const limit = Number(process.env.MARKETING_METRICS_LIMIT || 100);
    const minAgeHours = Number(process.env.MARKETING_METRICS_MIN_AGE_HOURS || 24);
    const learningMinObservations = Number(process.env.MARKETING_LEARNING_MIN_OBSERVATIONS || 10);
    const timeZone = process.env.MARKETING_LEARNING_TIMEZONE || "Europe/Madrid";

    const instagram = await resolveBrandInstagramAccessToken(brandId);
    const instagramEnrichment = await enrichPublishedGrowthGenomes(supabase as any, {
      brandId,
      channel: "instagram",
      days: Math.max(days, 60),
      timeZone,
    });

    const instagramResult = await syncGrowthInstagramMetrics(supabase as any, {
      brandId,
      days,
      limit,
      minAgeHours,
      learningMinObservations,
      accessToken: instagram.accessToken,
    });

    // Facebook is deliberately isolated from Instagram. A Facebook token/Graph
    // failure must not discard a successful Instagram metrics refresh.
    let facebookResult: unknown = null;
    let facebookError: string | null = null;
    try {
      facebookResult = await syncGrowthFacebookMetrics(supabase as any, {
        brandId,
        days,
        limit,
        minAgeHours,
        learningMinObservations,
        timeZone,
      });
    } catch (error) {
      facebookError = error instanceof Error ? error.message : String(error);
      console.error("[Marketing Growth Metrics][Facebook]", error);
    }

    return NextResponse.json({
      success: true,
      config: {
        brandId,
        days,
        limit,
        minAgeHours,
        learningMinObservations,
        timeZone,
        instagramChannelId: instagram.channelId,
        instagramAccountId: instagram.accountId,
        tokenScope: "brand_channel",
      },
      instagram: {
        enrichment: instagramEnrichment,
        ...instagramResult,
      },
      facebook: facebookError ? { success: false, error: facebookError } : { success: true, ...(facebookResult as Record<string, unknown>) },
    });
  } catch (error) {
    console.error("[Marketing Growth Metrics]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Growth metrics sync failed" },
      { status: 500 },
    );
  }
}
